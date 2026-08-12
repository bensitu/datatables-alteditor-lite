import { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';

import { createInlineOperationTarget } from './inline-operation-target.js';
import { buildInlineValues } from './inline-values.js';

import type { InlineEditSession } from './inline-edit-session.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorErrorHookContext } from '../core/alt-editor-lite-options.js';
import type { EditValidationResult } from '../core/editing/edit-transaction.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FieldPath } from '../object-path/field-path.js';

export interface InlineValidationControllerArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly fields: readonly FieldConfig<TFormValues>[];
  readonly language: Readonly<AltEditorLiteLanguage>;
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
    message: string,
  ) => Promise<void>;
}

/** Builds inline candidates and owns field, uniqueness, and change validation. */
export class InlineValidationController<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly arguments_: InlineValidationControllerArguments<TRow, TFormValues>,
  ) {}

  /** Validates the active candidate for the shared Edit transaction. */
  public async validate(
    session: InlineEditSession<TRow, TFormValues>,
    signal: AbortSignal,
  ): Promise<Readonly<EditValidationResult<TFormValues>>> {
    const candidate = session.candidate;
    const values = buildInlineValues(
      this.arguments_.fields,
      session.capture.rowCapture.sourceRow,
      session.capture.field.name,
      candidate,
    );
    const nativeResult = session.controller.validateNative();
    if (!nativeResult.valid) {
      return await this.validationFailure(
        session,
        nativeResult.message ?? this.arguments_.language.validation.invalid,
      );
    }

    const customResult = await session.controller.validateCustom(values, signal);
    signal.throwIfAborted();
    if (!customResult.valid) {
      return await this.validationFailure(
        session,
        customResult.message ?? this.arguments_.language.validation.invalid,
      );
    }

    const uniqueErrors = this.arguments_.validateUnique(
      values,
      session.capture.rowCapture.sourceRow,
    );
    const currentError = uniqueErrors[session.capture.field.name];
    if (currentError !== undefined) {
      return await this.validationFailure(session, currentError);
    }

    await session.pendingChange;
    signal.throwIfAborted();
    if (
      session.pendingChangeError?.revision === session.changeRevision &&
      this.arguments_.isCurrentSession(session)
    ) {
      const changeError = session.pendingChangeError.error;
      return await this.validationFailure(
        session,
        changeError.fieldErrors?.[session.capture.field.name] ?? changeError.message,
        changeError,
      );
    }

    return {
      changedFields: [session.capture.field.name] as FieldPath<TFormValues>[],
      collectedFieldValues: new Map([[session.capture.field.name, candidate]]),
      valid: true,
      values,
    };
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
    message: string,
    existingError?: AltEditorLiteError,
  ): Promise<Readonly<EditValidationResult<TFormValues>>> {
    const error =
      existingError ??
      new AltEditorLiteError({
        code: 'VALIDATION',
        fieldErrors: { [session.capture.field.name]: message },
        message,
        retryable: true,
      });
    await this.arguments_.presentFailure(session, error, message);
    return { error, valid: false };
  }
}
