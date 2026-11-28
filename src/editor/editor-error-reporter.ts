import {
  InternalOperationAbort,
  NEVER_ABORTED_SIGNAL,
  normalizeOperationError,
} from '../core/error-normalization.js';

import { dispatchEditorEvent } from './editor-event.js';

import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AfterSuccessContext,
  EditorErrorHookContext,
  EditorHooks,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from './alt-editor-lite.js';

function warnAboutErrorObserver(error: unknown): void {
  console.warn('AltEditorLite onError callback failed.', error);
}

/** Publishes normalized operation failures through the configured observers. */
export class EditorErrorReporter<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly editor: AltEditorLite<TRow, TFormValues>,
    private readonly eventTarget: EventTarget,
    private readonly language: Readonly<AltEditorLiteLanguage>,
    private readonly hooks: Readonly<EditorHooks<TRow, TFormValues>> | undefined,
    private readonly isDestroyed: () => boolean,
  ) {}

  /** Reports one failure without allowing observer failures to recurse. */
  public report(
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ): void {
    if (this.isDestroyed()) {
      return;
    }
    try {
      const observation: unknown = this.hooks?.onError?.(error, { ...context });
      if (observation !== undefined) {
        void Promise.resolve(observation).catch(warnAboutErrorObserver);
      }
    } catch (hookError: unknown) {
      warnAboutErrorObserver(hookError);
    }

    if (!publishEvent || this.isDestroyed()) {
      return;
    }

    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
      this.eventTarget,
      'alteditor-lite:error',
      { editor: this.editor, error, type: 'error', ...context },
    );
  }

  /** Runs the optional success observer after the canonical commit. */
  public async runAfterSuccess(
    context: AfterSuccessContext<TRow, TFormValues>,
    errorContext: EditorErrorHookContext,
  ): Promise<void> {
    const hook = this.hooks?.afterSuccess;
    if (hook === undefined || this.isDestroyed()) {
      return;
    }

    try {
      await Promise.resolve(hook(context));
    } catch (rawError: unknown) {
      const error = normalizeOperationError(
        rawError,
        NEVER_ABORTED_SIGNAL,
        this.language,
      );
      if (!(error instanceof InternalOperationAbort)) {
        this.report(error, errorContext, false);
      }
    }
  }
}
