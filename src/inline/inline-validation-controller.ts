import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { FormValidationRunner } from '../form/form-validation-runner.js';

import { createInlineOperationTarget } from './inline-operation-target.js';
import { buildInlineValues } from './inline-values.js';

import type { InlineEditSession } from './inline-edit-session.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorErrorHookContext } from '../core/alt-editor-lite-options.js';
import type { EditValidationResult } from '../core/editing/edit-transaction.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FormValidator } from '../form/form-validation.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api } from 'datatables.net';

export interface InlineValidationControllerArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly fields: readonly FieldConfig<TFormValues>[];
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly table: Api<TRow>;
  readonly validateForm?: FormValidator<TFormValues>;
  readonly validateUnique: (
    values: Readonly<EditorValues<TFormValues>>,
    excludedRow: TRow,
  ) => Readonly<Record<string, string>>;
  readonly reportError: (
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ) => void;
  readonly isCurrentSession: (session: InlineEditSession<TRow, TFormValues>) => boolean;
  readonly presentFailure: (
    session: InlineEditSession<TRow, TFormValues>,
    error: AltEditorLiteError,
    message: string | undefined,
  ) => Promise<void>;
}

/** Builds inline candidates and owns field, uniqueness, and change validation. */
export class InlineValidationController<TRow extends object, TFormValues extends object> {
  private readonly fieldNames: ReadonlySet<string>;

  public constructor(
    private readonly arguments_: InlineValidationControllerArguments<TRow, TFormValues>,
  ) {
    this.fieldNames = new Set(arguments_.fields.map(({ name }) => name));
  }

  /** Validates the active candidate for the shared Edit transaction. */
  public async validate(
    session: InlineEditSession<TRow, TFormValues>,
    signal: AbortSignal,
  ): Promise<Readonly<EditValidationResult<TFormValues>>> {
    const validateForm = this.arguments_.validateForm;
    const mergedSignal = mergeAbortSignals([
      signal,
      session.lifecycleAbortController.signal,
    ]);
    const { signal: currentSignal } = mergedSignal;
    try {
      const validation = await new FormValidationRunner<TFormValues>({
        allowedFieldNames: this.fieldNames,
        beforeFormValidation: async (validationSignal) => {
          await session.pendingChange;
          validationSignal.throwIfAborted();
          if (
            session.pendingChangeError?.revision === session.changeRevision &&
            this.arguments_.isCurrentSession(session)
          ) {
            return session.pendingChangeError.error;
          }
          return undefined;
        },
        collectValues: () =>
          buildInlineValues(
            this.arguments_.fields,
            session.capture.rowCapture.sourceRow,
            session.capture.field.name,
            session.candidate,
          ),
        controllers: [session.controller],
        invalidMessage: this.arguments_.language.validation.invalid,
        validateUnique: (values) =>
          this.arguments_.validateUnique(values, session.capture.rowCapture.sourceRow),
        ...(validateForm === undefined
          ? {}
          : {
              validateForm: async (values, validationSignal) =>
                await Promise.resolve(
                  validateForm(
                    values,
                    Object.freeze({
                      mode: 'inline',
                      operation: 'edit',
                      signal: validationSignal,
                    }),
                  ),
                ),
            }),
      }).run(currentSignal);
      currentSignal.throwIfAborted();
      if (!validation.valid) {
        return await this.validationFailure(session, validation.error);
      }

      return {
        changedFields: [session.capture.field.name] as FieldPath<TFormValues>[],
        collectedFieldValues: new Map([[session.capture.field.name, session.candidate]]),
        valid: true,
        values: validation.values,
      };
    } finally {
      mergedSignal.dispose();
    }
  }

  /** Runs the active field callback and retains only its current failure. */
  public async runOnChange(
    session: InlineEditSession<TRow, TFormValues>,
    signal: AbortSignal,
    revision: number,
  ): Promise<void> {
    try {
      const candidate = await Promise.resolve(session.controller.getValue(signal));
      const values = buildInlineValues(
        this.arguments_.fields,
        session.capture.rowCapture.sourceRow,
        session.capture.field.name,
        candidate,
      );
      await session.controller.runOnChange(values, signal);
      if (
        !signal.aborted &&
        this.arguments_.isCurrentSession(session) &&
        revision === session.changeRevision
      ) {
        delete session.pendingChangeError;
      }
    } catch (rawError: unknown) {
      if (
        signal.aborted ||
        !this.arguments_.isCurrentSession(session) ||
        revision !== session.changeRevision
      ) {
        return;
      }

      const error = normalizeOperationError(rawError, signal, this.arguments_.language);
      if (error instanceof InternalOperationAbort) {
        return;
      }
      session.pendingChangeError = { error, revision };
      this.arguments_.reportError(
        error,
        {
          committed: false,
          mode: 'inline',
          operation: 'edit',
          phase: 'validation',
          target: createInlineOperationTarget(session.capture.summary),
        },
        true,
      );
    }
  }

  private async validationFailure(
    session: InlineEditSession<TRow, TFormValues>,
    error: AltEditorLiteError,
  ): Promise<Readonly<EditValidationResult<TFormValues>>> {
    await this.arguments_.presentFailure(
      session,
      error,
      error.fieldErrors?.[session.capture.field.name],
    );
    return { error, valid: false };
  }
}
