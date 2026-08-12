import { dispatchEditorEvent } from './editor-event.js';
import {
  InternalOperationAbort,
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
import type { InlineEventTarget } from './editor-event.js';

/** Publishes normalized operation failures through the configured observers. */
export class EditorErrorReporter<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly editor: AltEditorLite<TRow, TFormValues>,
    private readonly tableElement: HTMLTableElement,
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
    try {
      this.hooks?.onError?.(error, context);
    } catch (hookError: unknown) {
      console.warn('AltEditorLite onError callback failed.', hookError);
    }

    if (!publishEvent || this.isDestroyed()) {
      return;
    }

    const inlineTarget = this.createInlineTarget(context);
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
      this.tableElement,
      'alteditor-lite:error',
      {
        editor: this.editor,
        error,
        mode: context.mode,
        operation: context.operation,
        ...(inlineTarget === undefined ? {} : { target: inlineTarget }),
        type: 'error',
      },
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
        new AbortController().signal,
        this.language,
      );
      if (!(error instanceof InternalOperationAbort)) {
        this.report(
          error,
          {
            committed: true,
            mode: context.mode,
            operation: context.operation,
            phase: 'afterSuccess',
            ...(context.target === undefined ? {} : { target: context.target }),
          },
          false,
        );
      }
    }
  }

  private createInlineTarget(
    context: EditorErrorHookContext,
  ): Readonly<InlineEventTarget> | undefined {
    if (
      context.mode !== 'inline' ||
      context.target?.columnIndex === undefined ||
      context.target.fieldNames[0] === undefined
    ) {
      return undefined;
    }

    return {
      columnIndex: context.target.columnIndex,
      fieldName: context.target.fieldNames[0],
      rowIndex: context.target.rowIndex,
      ...(context.target.rowId === undefined ? {} : { rowId: context.target.rowId }),
      ...(context.target.columnName === undefined
        ? {}
        : { columnName: context.target.columnName }),
    };
  }
}
