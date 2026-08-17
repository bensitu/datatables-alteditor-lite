import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';

import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type {
  OperationOwner,
  OwnedOperationRequest,
} from '../core/editing/operation-owner.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorHost } from '../host/editor-host.js';

export interface DialogRemovePresentation {
  startSubmission(): void;
  restoreAfterAbort(): void;
  showOperationError(error: AltEditorLiteError): void;
  completeSuccess(): void;
}

export interface DialogRemoveOperationArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly host: EditorHost<TRow, TTarget>;
  readonly eventTarget: EventTarget;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly operationOwner: OperationOwner;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly onPresentationComplete: () => void;
}

/** Persists and commits removal of one captured row set. */
export class DialogRemoveOperation<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  public constructor(
    private readonly arguments_: DialogRemoveOperationArguments<
      TRow,
      TFormValues,
      TTarget
    >,
  ) {}

  /** Runs one Remove confirmation submission. */
  public async run(
    targets: readonly TTarget[],
    rows: readonly Readonly<TRow>[],
    presentation: DialogRemovePresentation,
  ): Promise<void> {
    presentation.startSubmission();
    const request = this.arguments_.operationOwner.begin('remove', 'dialog');
    let phase: EditorErrorHookContext['phase'] = 'submit';

    try {
      for (const target of targets) {
        this.arguments_.host.read(target);
      }
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.arguments_.eventTarget,
        'alteditor-lite:submit',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'remove',
          rows,
          type: 'submit',
        },
      );
      if (!this.owns(request)) {
        return;
      }

      phase = 'persistence';
      if (this.arguments_.options.operations?.remove !== undefined) {
        await this.arguments_.options.operations.remove(
          rows,
          this.arguments_.operationOwner.context(request),
        );
      }
      if (!this.owns(request)) {
        return;
      }

      phase = 'commit';
      await this.arguments_.host.applyRemove(targets, {
        mode: 'dialog',
        operation: 'remove',
        signal: request.abortController.signal,
      });
      if (!this.owns(request)) {
        return;
      }
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.arguments_.eventTarget,
        'alteditor-lite:success',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'remove',
          rows,
          type: 'success',
        },
      );
      if (!this.owns(request)) {
        return;
      }

      this.arguments_.operationOwner.complete(request);
      presentation.completeSuccess();
      this.arguments_.onPresentationComplete();
      await this.arguments_.errorReporter.runAfterSuccess({
        mode: 'dialog',
        operation: 'remove',
        rows,
      });
    } catch (rawError: unknown) {
      this.handleFailure(presentation, request, rawError, phase);
    }
  }

  private owns(request: OwnedOperationRequest): boolean {
    return this.arguments_.operationOwner.owns(request);
  }

  private handleFailure(
    presentation: DialogRemovePresentation,
    request: OwnedOperationRequest,
    rawError: unknown,
    phase: EditorErrorHookContext['phase'],
  ): void {
    if (!this.owns(request)) {
      return;
    }

    const operationError = normalizeOperationError(
      rawError,
      request.abortController.signal,
      this.arguments_.language,
    );
    this.arguments_.operationOwner.complete(request);
    if (operationError instanceof InternalOperationAbort) {
      presentation.restoreAfterAbort();
      return;
    }

    presentation.showOperationError(operationError);
    this.arguments_.errorReporter.report(
      operationError,
      {
        committed: false,
        mode: 'dialog',
        operation: 'remove',
        phase,
      },
      true,
    );
  }
}
