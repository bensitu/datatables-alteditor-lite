import {
  type AltEditorLiteError,
  EditorConfigurationError,
} from '../alt-editor-lite-error.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../error-normalization.js';
import { freezeEditorValues } from '../freeze-editor-values.js';
import { mergeDeclaredFieldValues } from '../merge-declared-field-values.js';

import type { AltEditorLiteLanguage } from '../alt-editor-lite-language.js';
import type {
  AfterSuccessContext,
  BeforeSubmitContext,
  ClientSideOperations,
  EditorOperations,
  EditorErrorHookContext,
} from '../alt-editor-lite-options.js';
import type { EditorOperationTarget } from '../editor-operation.js';
import type { EditPresentationAdapter } from './edit-presentation-adapter.js';
import type { EditCommitResult, EditTransaction } from './edit-transaction.js';
import type { OperationOwner, OwnedOperationRequest } from './operation-owner.js';
import type { Api } from 'datatables.net';

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function assertCompleteRow(
  rowCandidate: unknown,
  callbackName: string,
): asserts rowCandidate is object {
  if (
    typeof rowCandidate !== 'object' ||
    rowCandidate === null ||
    Array.isArray(rowCandidate)
  ) {
    throw new EditorConfigurationError(
      `${callbackName} must return a complete row object.`,
    );
  }
}

/** Terminal result returned to dialog and inline presentation callers. */
export type EditOperationResult<TRow extends object> =
  | { readonly status: 'success'; readonly result: Readonly<EditCommitResult<TRow>> }
  | { readonly status: 'validation-failed'; readonly error: AltEditorLiteError }
  | { readonly status: 'vetoed' }
  | { readonly status: 'aborted' }
  | { readonly status: 'failed'; readonly error: AltEditorLiteError };

/** Presentation and lifecycle callbacks for one shared Edit run. */
export interface EditOperationRunArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly mode: 'dialog' | 'inline';
  readonly original: Readonly<TRow>;
  readonly target: Readonly<EditorOperationTarget>;
  readonly presentation: EditPresentationAdapter<TRow, TFormValues>;
  readonly revalidateTarget: () => number;
  readonly commit: (
    row: TRow,
    rowIndex: number,
    request: OwnedOperationRequest,
  ) => Promise<Readonly<EditCommitResult<TRow>>>;
  readonly dispatchSubmit: (
    transaction: Readonly<EditTransaction<TRow, TFormValues>>,
  ) => void;
  readonly dispatchSuccess: (
    transaction: Readonly<EditTransaction<TRow, TFormValues>>,
    result: Readonly<EditCommitResult<TRow>>,
  ) => void;
  readonly beforeSubmit?: (
    transaction: Readonly<EditTransaction<TRow, TFormValues>>,
    context: BeforeSubmitContext<TRow>,
  ) => Promise<boolean>;
  readonly afterSuccess?: (
    context: AfterSuccessContext<TRow, TFormValues>,
  ) => Promise<void>;
  readonly reportError: (
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ) => void;
}

/** Shared non-optimistic Edit persistence and commit runner. */
export class EditOperationRunner<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly table: Api<TRow>,
    private readonly operationOwner: OperationOwner,
    private readonly language: Readonly<AltEditorLiteLanguage>,
    private readonly operations:
      Readonly<EditorOperations<TRow, TFormValues>> | undefined,
    private readonly clientSide:
      Readonly<ClientSideOperations<TRow, TFormValues>> | undefined,
  ) {}

  /** Runs validation, persistence, commit, events, and hooks in a fixed order. */
  public async run(
    runArguments: EditOperationRunArguments<TRow, TFormValues>,
  ): Promise<EditOperationResult<TRow>> {
    const request = this.operationOwner.begin(
      'edit',
      runArguments.mode,
      runArguments.target,
    );
    let phase: EditorErrorHookContext['phase'] = 'validation';

    try {
      runArguments.presentation.startValidation();
      const validation = await runArguments.presentation.validate(
        request.abortController.signal,
      );
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      if (!validation.valid) {
        this.operationOwner.complete(request);
        runArguments.presentation.restoreAfterValidationFailure();
        return { error: validation.error, status: 'validation-failed' };
      }

      const transaction: Readonly<EditTransaction<TRow, TFormValues>> = Object.freeze({
        changedFields: Object.freeze([...validation.changedFields]),
        collectedFieldValues: validation.collectedFieldValues,
        mode: runArguments.mode,
        original: runArguments.original,
        target: runArguments.target,
        values: freezeEditorValues(validation.values),
      });
      runArguments.revalidateTarget();

      phase = 'submit';
      if (runArguments.beforeSubmit !== undefined) {
        const shouldContinue = await runArguments.beforeSubmit(
          transaction,
          this.operationOwner.context(this.table, request),
        );
        if (!this.operationOwner.owns(request)) {
          return { status: 'aborted' };
        }
        if (!shouldContinue) {
          this.operationOwner.complete(request);
          runArguments.presentation.restoreAfterValidationFailure();
          return { status: 'vetoed' };
        }
      }

      runArguments.dispatchSubmit(transaction);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      runArguments.revalidateTarget();

      runArguments.presentation.setBusy(true);
      phase = 'persistence';
      const row = await this.updateRow(transaction, request);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      const rowIndex = runArguments.revalidateTarget();

      phase = 'commit';
      const result = await runArguments.commit(row, rowIndex, request);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      runArguments.dispatchSuccess(transaction, result);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      await runArguments.presentation.completeSuccess(result);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      phase = 'afterSuccess';
      if (runArguments.afterSuccess !== undefined) {
        try {
          await runArguments.afterSuccess({
            mode: runArguments.mode,
            operation: 'edit',
            original: transaction.original,
            row: result.row,
            table: this.table,
            target: transaction.target,
            values: transaction.values,
          });
        } catch (rawError: unknown) {
          const hookError = this.normalize(rawError, request);
          if (!(hookError instanceof InternalOperationAbort)) {
            runArguments.reportError(
              hookError,
              {
                committed: true,
                mode: runArguments.mode,
                operation: 'edit',
                phase: 'afterSuccess',
                target: runArguments.target,
              },
              false,
            );
          }
        }
      }

      this.operationOwner.complete(request);
      return { result, status: 'success' };
    } catch (rawError: unknown) {
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      const operationError = this.normalize(rawError, request);
      this.operationOwner.complete(request);
      runArguments.presentation.setBusy(false);
      if (operationError instanceof InternalOperationAbort) {
        runArguments.presentation.restoreAfterOperationFailure();
        return { status: 'aborted' };
      }

      try {
        await runArguments.presentation.showOperationError(operationError);
      } catch (rawPresentationError: unknown) {
        const presentationError = this.normalize(rawPresentationError, request);
        if (!(presentationError instanceof InternalOperationAbort)) {
          runArguments.reportError(
            presentationError,
            {
              committed: false,
              mode: runArguments.mode,
              operation: 'edit',
              phase,
              target: runArguments.target,
            },
            false,
          );
        }
      }
      runArguments.presentation.restoreAfterOperationFailure();
      runArguments.reportError(
        operationError,
        {
          committed: false,
          mode: runArguments.mode,
          operation: 'edit',
          phase,
          target: runArguments.target,
        },
        true,
      );
      return { error: operationError, status: 'failed' };
    }
  }

  private async updateRow(
    transaction: Readonly<EditTransaction<TRow, TFormValues>>,
    request: OwnedOperationRequest,
  ): Promise<TRow> {
    if (this.operations?.update !== undefined) {
      const rowCandidate: unknown = await this.operations.update(
        transaction.values,
        transaction.original,
        this.operationOwner.context(this.table, request),
      );
      assertCompleteRow(rowCandidate, 'operations.update');
      return rowCandidate as TRow;
    }

    if (this.clientSide?.updateRow !== undefined) {
      const rowCandidate: unknown = this.clientSide.updateRow(
        transaction.original,
        transaction.values,
      );
      if (isPromiseLike(rowCandidate)) {
        throw new EditorConfigurationError(
          'clientSide.updateRow must return synchronously.',
        );
      }
      assertCompleteRow(rowCandidate, 'clientSide.updateRow');
      return rowCandidate as TRow;
    }

    return mergeDeclaredFieldValues(
      transaction.original,
      transaction.values,
      transaction.changedFields,
      transaction.collectedFieldValues,
    );
  }

  private normalize(
    rawError: unknown,
    request: OwnedOperationRequest,
  ): AltEditorLiteError | InternalOperationAbort {
    return normalizeOperationError(
      rawError,
      request.abortController.signal,
      this.language,
    );
  }
}
