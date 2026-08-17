import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { resolveRemoveTargets } from '../datatables/row-target-resolution.js';
import { synchronizeExtensionStateAfterCommit } from '../datatables/synchronize-extension-state.js';

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
import type { DataTablesHost } from '../datatables/data-tables-host.js';
import type { RemoveTargetCapture } from '../datatables/row-target-resolution.js';
import type { Api } from 'datatables.net';

export interface DialogRemovePresentation {
  startSubmission(): void;
  restoreAfterAbort(): void;
  showOperationError(error: AltEditorLiteError): void;
  completeSuccess(): void;
}

export interface DialogRemoveOperationArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly table: Api<TRow>;
  readonly host: DataTablesHost<TRow>;
  readonly tableElement: HTMLTableElement;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly operationOwner: OperationOwner;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
}

/** Persists and commits removal of one captured row set. */
export class DialogRemoveOperation<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly arguments_: DialogRemoveOperationArguments<TRow, TFormValues>,
  ) {}

  /** Runs one Remove confirmation submission. */
  public async run(
    capture: RemoveTargetCapture<TRow>,
    presentation: DialogRemovePresentation,
  ): Promise<void> {
    presentation.startSubmission();
    const request = this.arguments_.operationOwner.begin('remove', 'dialog');
    let phase: EditorErrorHookContext['phase'] = 'submit';

    try {
      this.resolveTargets(capture);
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.arguments_.tableElement,
        'alteditor-lite:submit',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'remove',
          rows: capture.snapshot.originals,
          type: 'submit',
        },
      );
      if (!this.owns(request)) {
        return;
      }

      this.resolveTargets(capture);
      phase = 'persistence';
      if (this.arguments_.options.operations?.remove !== undefined) {
        await this.arguments_.options.operations.remove(
          capture.snapshot.originals,
          this.arguments_.operationOwner.context(this.arguments_.table, request),
        );
      }
      if (!this.owns(request)) {
        return;
      }

      const rowIndexes = this.resolveTargets(capture);
      phase = 'commit';
      await this.arguments_.host.applyRemove(rowIndexes, {
        mode: 'dialog',
        operation: 'remove',
        signal: request.abortController.signal,
      });
      if (!this.owns(request)) {
        return;
      }
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.arguments_.tableElement,
        'alteditor-lite:success',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'remove',
          rows: capture.snapshot.originals,
          type: 'success',
        },
      );
      if (!this.owns(request)) {
        return;
      }

      this.arguments_.operationOwner.complete(request);
      presentation.completeSuccess();
      synchronizeExtensionStateAfterCommit(this.arguments_.table);
      await this.arguments_.errorReporter.runAfterSuccess({
        mode: 'dialog',
        operation: 'remove',
        rows: capture.snapshot.originals,
        table: this.arguments_.table,
      });
    } catch (rawError: unknown) {
      this.handleFailure(presentation, request, rawError, phase);
    }
  }

  private resolveTargets(capture: RemoveTargetCapture<TRow>): readonly number[] {
    return resolveRemoveTargets(
      this.arguments_.table,
      this.arguments_.tableElement,
      capture,
      this.arguments_.language.errors.targetUnavailable,
    );
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
