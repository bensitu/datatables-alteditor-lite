import { dispatchEditorEvent } from './editor-event.js';
import {
  InternalOperationAbort,
  NEVER_ABORTED_SIGNAL,
  normalizeOperationError,
} from './error-normalization.js';

import type { AltEditorLiteError } from './alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type {
  AfterSuccessContext,
  EditorErrorHookContext,
  EditorHooks,
} from './alt-editor-lite-options.js';
import type { AltEditorLite } from './alt-editor-lite.js';

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
      this.hooks?.onError?.(error, context);
    } catch (hookError: unknown) {
      console.warn('AltEditorLite onError callback failed.', hookError);
    }

    if (!publishEvent || this.isDestroyed()) {
      return;
    }

    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
      this.eventTarget,
      'alteditor-lite:error',
      { editor: this.editor, error, type: 'error', ...this.operationContext(context) },
    );
  }

  /** Runs the optional success observer after the canonical commit. */
  public async runAfterSuccess(
    context: AfterSuccessContext<TRow, TFormValues>,
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
        this.report(
          error,
          { committed: true, phase: 'afterSuccess', ...this.operationContext(context) },
          false,
        );
      }
    }
  }

  private operationContext(
    context: AfterSuccessContext<TRow, TFormValues> | EditorErrorHookContext,
  ) {
    switch (context.operation) {
      case 'create':
      case 'remove': {
        return {
          mode: 'dialog' as const,
          operation: context.operation,
        };
      }
      case 'edit': {
        return {
          mode: context.mode,
          operation: 'edit' as const,
          target: context.target,
        };
      }
      case 'batchEdit': {
        return {
          mode: 'dialog' as const,
          operation: 'batchEdit' as const,
          targets: context.targets,
        };
      }
      case 'refresh': {
        return context.mode === 'inline' && context.target !== undefined
          ? {
              mode: 'inline' as const,
              operation: 'refresh' as const,
              target: context.target,
            }
          : { mode: 'api' as const, operation: 'refresh' as const };
      }
    }
  }
}
