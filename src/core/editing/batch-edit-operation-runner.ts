import {
  type AltEditorLiteError,
  EditorConfigurationError,
  EditorSelectionCountError,
} from '../alt-editor-lite-error.js';
import { assertCompleteRow, isPromiseLike } from '../complete-row-result.js';
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
  EditorErrorHookContext,
  EditorOperations,
} from '../alt-editor-lite-options.js';
import type { EditorOperationTarget } from '../editor-operation.js';
import type { BatchEditPresentationAdapter } from './batch-edit-presentation-adapter.js';
import type {
  BatchEditCommitResult,
  BatchEditTransaction,
} from './batch-edit-transaction.js';
import type { OperationOwner, OwnedOperationRequest } from './operation-owner.js';
import type { MaybePromise } from '../../fields/field-value.js';

/** Terminal result returned to the batch dialog presentation. */
export type BatchEditOperationResult<TRow extends object> =
  | { readonly status: 'success'; readonly result: BatchEditCommitResult<TRow> }
  | { readonly status: 'unchanged' }
  | { readonly status: 'validation-failed'; readonly error: AltEditorLiteError }
  | { readonly status: 'vetoed' }
  | { readonly status: 'aborted' }
  | { readonly status: 'failed'; readonly error: AltEditorLiteError };

/** Presentation and lifecycle callbacks for one batch edit operation. */
export interface BatchEditOperationRunArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly originals: readonly Readonly<TRow>[];
  readonly recordTargets: readonly TTarget[];
  readonly targets: readonly Readonly<EditorOperationTarget>[];
  readonly presentation: BatchEditPresentationAdapter<TRow, TFormValues>;
  readonly revalidateTargets: (signal: AbortSignal) => MaybePromise<void>;
  readonly commit: (
    rows: readonly TRow[],
    request: OwnedOperationRequest<'batchEdit'>,
  ) => Promise<void>;
  readonly dispatchSubmit: (
    transaction: Readonly<BatchEditTransaction<TRow, TFormValues, TTarget>>,
  ) => void;
  readonly dispatchSuccess: (
    transaction: Readonly<BatchEditTransaction<TRow, TFormValues, TTarget>>,
    result: Readonly<BatchEditCommitResult<TRow>>,
  ) => void;
  readonly beforeSubmit?: (
    transaction: Readonly<BatchEditTransaction<TRow, TFormValues, TTarget>>,
    context: Extract<BeforeSubmitContext<TRow>, { readonly operation: 'batchEdit' }>,
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

/** Runs non-optimistic persistence and commit for one batch edit operation. */
export class BatchEditOperationRunner<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly operationOwner: OperationOwner,
    private readonly language: Readonly<AltEditorLiteLanguage>,
    private readonly operations:
      Readonly<EditorOperations<TRow, TFormValues>> | undefined,
    private readonly clientSide:
      Readonly<ClientSideOperations<TRow, TFormValues>> | undefined,
  ) {}

  /** Validates, persists, and commits one common change set. */
  public async run<TTarget>(
    runArguments: BatchEditOperationRunArguments<TRow, TFormValues, TTarget>,
  ): Promise<BatchEditOperationResult<TRow>> {
    this.assertInputs(runArguments);
    const request = this.operationOwner.begin(
      'batchEdit',
      'dialog',
      runArguments.targets,
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

      const transaction: Readonly<BatchEditTransaction<TRow, TFormValues, TTarget>> =
        Object.freeze({
          changes: freezeEditorValues(validation.changes),
          changedFields: Object.freeze([...validation.changedFields]),
          collectedFieldValues: validation.collectedFieldValues,
          originals: Object.freeze([...runArguments.originals]),
          recordTargets: Object.freeze([...runArguments.recordTargets]),
          targets: Object.freeze([...runArguments.targets]),
        });

      if (
        transaction.changedFields.length === 0 ||
        Object.keys(transaction.changes).length === 0
      ) {
        this.operationOwner.complete(request);
        await runArguments.presentation.completeUnchanged();
        return { status: 'unchanged' };
      }

      await Promise.resolve(
        runArguments.revalidateTargets(request.abortController.signal),
      );
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      phase = 'submit';
      if (runArguments.beforeSubmit !== undefined) {
        const shouldContinue = await runArguments.beforeSubmit(
          transaction,
          Object.freeze({
            ...this.operationOwner.context(request),
            originals: transaction.originals,
          }),
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
      await Promise.resolve(
        runArguments.revalidateTargets(request.abortController.signal),
      );
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      runArguments.presentation.setBusy(true);
      phase = 'persistence';
      const rows = await this.updateRows(transaction, request);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      await Promise.resolve(
        runArguments.revalidateTargets(request.abortController.signal),
      );
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      phase = 'commit';
      await runArguments.commit(rows, request);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      const result = Object.freeze({ rows: Object.freeze([...rows]) });
      runArguments.dispatchSuccess(transaction, result);
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }
      try {
        await runArguments.presentation.completeSuccess(result);
      } catch (rawPresentationError: unknown) {
        const presentationError = this.normalize(rawPresentationError, request);
        if (presentationError instanceof InternalOperationAbort) {
          return { status: 'aborted' };
        }
        runArguments.reportError(
          presentationError,
          {
            committed: true,
            mode: 'dialog',
            operation: 'batchEdit',
            phase: 'afterSuccess',
            targets: runArguments.targets,
          },
          false,
        );
      }
      if (!this.operationOwner.owns(request)) {
        return { status: 'aborted' };
      }

      phase = 'afterSuccess';
      if (runArguments.afterSuccess !== undefined) {
        try {
          await runArguments.afterSuccess({
            changes: transaction.changes,
            mode: 'dialog',
            operation: 'batchEdit',
            originals: transaction.originals,
            rows: result.rows,
            targets: transaction.targets,
          });
        } catch (rawError: unknown) {
          const hookError = this.normalize(rawError, request);
          if (!(hookError instanceof InternalOperationAbort)) {
            runArguments.reportError(
              hookError,
              {
                committed: true,
                mode: 'dialog',
                operation: 'batchEdit',
                phase,
                targets: transaction.targets,
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
              mode: 'dialog',
              operation: 'batchEdit',
              phase,
              targets: runArguments.targets,
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
          mode: 'dialog',
          operation: 'batchEdit',
          phase,
          targets: runArguments.targets,
        },
        true,
      );
      return { error: operationError, status: 'failed' };
    }
  }

  private assertInputs<TTarget>(
    runArguments: BatchEditOperationRunArguments<TRow, TFormValues, TTarget>,
  ): void {
    const targetCount = runArguments.recordTargets.length;
    if (targetCount < 2) {
      throw new EditorSelectionCountError(
        'at-least-two',
        targetCount,
        this.language.batchEdit.selectionRequired,
      );
    }
    if (
      runArguments.originals.length !== targetCount ||
      runArguments.targets.length !== targetCount
    ) {
      throw new EditorConfigurationError(
        'Batch Edit targets, operation targets, and original rows must have matching lengths.',
      );
    }
    if (new Set(runArguments.recordTargets).size !== targetCount) {
      throw new EditorConfigurationError('Batch Edit targets must be distinct.');
    }
  }

  private async updateRows<TTarget>(
    transaction: Readonly<BatchEditTransaction<TRow, TFormValues, TTarget>>,
    request: OwnedOperationRequest<'batchEdit'>,
  ): Promise<readonly TRow[]> {
    if (this.operations?.updateMany !== undefined) {
      const rowCandidates: unknown = await this.operations.updateMany(
        transaction.changes,
        transaction.originals,
        this.operationOwner.context(request),
      );
      return this.assertCanonicalRows(rowCandidates, transaction.originals.length);
    }

    if (this.operations?.update !== undefined) {
      throw new EditorConfigurationError(
        'Batch Edit requires operations.updateMany when operations.update owns persistence.',
      );
    }

    return Object.freeze(
      transaction.originals.map((original) => {
        const rowCandidate: unknown =
          this.clientSide?.updateRow === undefined
            ? mergeDeclaredFieldValues(
                original,
                transaction.changes,
                transaction.changedFields,
                transaction.collectedFieldValues,
              )
            : this.clientSide.updateRow(original, transaction.changes);
        if (isPromiseLike(rowCandidate)) {
          throw new EditorConfigurationError(
            'clientSide.updateRow must return synchronously.',
          );
        }
        assertCompleteRow(
          rowCandidate,
          this.clientSide?.updateRow === undefined
            ? 'the declared-field batch update'
            : 'clientSide.updateRow',
        );
        return rowCandidate as TRow;
      }),
    );
  }

  private assertCanonicalRows(
    rowCandidates: unknown,
    expectedCount: number,
  ): readonly TRow[] {
    if (!Array.isArray(rowCandidates)) {
      throw new EditorConfigurationError(
        'operations.updateMany must return an array of complete row objects.',
      );
    }
    if (rowCandidates.length !== expectedCount) {
      throw new EditorConfigurationError(
        'operations.updateMany must return one canonical row for each original row.',
      );
    }
    for (const rowCandidate of rowCandidates) {
      assertCompleteRow(rowCandidate, 'operations.updateMany');
    }
    return Object.freeze([...(rowCandidates as TRow[])]);
  }

  private normalize(
    rawError: unknown,
    request: OwnedOperationRequest<'batchEdit'>,
  ): AltEditorLiteError | InternalOperationAbort {
    return normalizeOperationError(
      rawError,
      request.abortController.signal,
      this.language,
    );
  }
}
