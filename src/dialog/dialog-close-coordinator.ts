import { EditorOperationBusyError } from '../core/alt-editor-lite-error.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { settleWithAbort } from '../core/settle-with-abort.js';

import { getDialogSessionOperation, type DialogSession } from './dialog-session.js';

import type { EditorDialog } from './editor-dialog.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeCloseReason,
} from '../core/alt-editor-lite-options.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';

interface DialogCloseCoordinatorArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly dialog: EditorDialog;
  readonly onClose: (reason: BeforeCloseReason) => void;
}

/** Owns asynchronous close decisions and their invalidation by form changes. */
export class DialogCloseCoordinator<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  #closeDecisionAbortController: AbortController | undefined;
  #closeDecisionTask: Promise<void> | undefined;

  public constructor(
    private readonly arguments_: DialogCloseCoordinatorArguments<TRow, TFormValues>,
  ) {}

  public request(
    session: DialogSession<TRow, TFormValues, TTarget>,
    reason: BeforeCloseReason,
  ): Promise<void> {
    if (this.#closeDecisionTask !== undefined) return this.#closeDecisionTask;
    const abortController = new AbortController();
    this.#closeDecisionAbortController = abortController;
    const task = Promise.resolve().then(() =>
      this.#evaluateCloseRequest(session, reason, abortController),
    );
    this.#closeDecisionTask = task;
    return task;
  }

  async #evaluateCloseRequest(
    session: DialogSession<TRow, TFormValues, TTarget>,
    reason: BeforeCloseReason,
    abortController: AbortController,
  ): Promise<void> {
    const form = session.action === 'remove' ? undefined : session.form;
    const revision = form?.revision;
    const isCurrent = (): boolean => {
      if (abortController.signal.reason instanceof EditorOperationBusyError) {
        throw abortController.signal.reason;
      }
      return (
        !abortController.signal.aborted &&
        this.#closeDecisionAbortController === abortController &&
        form?.revision === revision
      );
    };
    try {
      if (!isCurrent()) {
        return;
      }
      const beforeClose = this.arguments_.options.hooks?.beforeClose;
      if (beforeClose !== undefined) {
        const isDirty = await settleWithAbort(
          form?.isDirty() ?? false,
          abortController.signal,
        );
        if (!isCurrent()) {
          return;
        }
        const shouldClose = await settleWithAbort(
          beforeClose(
            Object.freeze({
              dirty: isDirty,
              mode: 'dialog',
              operation: session.action,
              reason,
              signal: abortController.signal,
            }),
          ),
          abortController.signal,
        );
        if (!isCurrent()) {
          return;
        }
        if (shouldClose === false) {
          this.arguments_.dialog.ensureFocus();
          return;
        }
      }
      this.arguments_.onClose(reason);
    } catch (rawError: unknown) {
      if (abortController.signal.reason instanceof EditorOperationBusyError) {
        throw abortController.signal.reason;
      }
      if (!isCurrent()) {
        return;
      }
      const error = normalizeOperationError(
        rawError,
        abortController.signal,
        this.arguments_.language,
      );
      if (error instanceof InternalOperationAbort) {
        return;
      }
      this.arguments_.dialog.showError(error.message);
      this.arguments_.dialog.ensureFocus();
      this.arguments_.errorReporter.report(
        error,
        {
          committed: false,
          mode: 'dialog',
          phase: 'close',
          ...getDialogSessionOperation(session),
        },
        true,
      );
      throw error;
    } finally {
      if (this.#closeDecisionAbortController === abortController) {
        this.cancel();
      }
    }
  }

  public cancel(reason?: Error): void {
    this.#closeDecisionAbortController?.abort(reason);
    this.#closeDecisionAbortController = undefined;
    this.#closeDecisionTask = undefined;
  }
}
