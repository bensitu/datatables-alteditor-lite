import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { readHostRecords } from '../host/host-record-reader.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeOpenContext,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { EditorHost } from '../host/editor-host.js';

export interface DialogOpenCoordinatorArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly host: EditorHost<TRow, TTarget>;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
}

/** Owns cancellation, reads, hooks, and error handling for dialog opening. */
export class DialogOpenCoordinator<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  private activeRequest: AbortController | undefined;

  public constructor(
    private readonly arguments_: DialogOpenCoordinatorArguments<
      TRow,
      TFormValues,
      TTarget
    >,
  ) {}

  public begin(): AbortController {
    this.cancel();
    const request = new AbortController();
    this.activeRequest = request;
    return request;
  }

  public complete(request: AbortController | undefined): void {
    if (this.activeRequest === request) {
      this.activeRequest = undefined;
    }
  }

  public cancel(): void {
    this.activeRequest?.abort();
    this.activeRequest = undefined;
  }

  public assertCurrent(request: AbortController): void {
    if (this.activeRequest !== request || request.signal.aborted) {
      throw new DOMException('The open request was cancelled.', 'AbortError');
    }
  }

  public async readSnapshots(
    targets: readonly TTarget[],
    request: AbortController,
    errorContext: EditorErrorHookContext,
  ): Promise<readonly Readonly<TRow>[]> {
    const { signal } = request;
    try {
      const rows = await readHostRecords(this.arguments_.host, targets, signal);
      this.assertCurrent(request);
      return rows.map((row) => createReadonlyRowView<TRow>(row));
    } catch (rawError: unknown) {
      const error = normalizeOperationError(rawError, signal, this.arguments_.language);
      if (!(error instanceof InternalOperationAbort)) {
        this.arguments_.errorReporter.report(error, errorContext, true);
      }
      throw error;
    }
  }

  public runBeforeOpen(operation: 'create', request: AbortController): Promise<boolean>;
  public runBeforeOpen(
    operation: 'edit',
    request: AbortController,
    row: Readonly<TRow>,
    target: Readonly<EditorOperationTarget>,
  ): Promise<boolean>;
  public runBeforeOpen(
    operation: 'batchEdit' | 'remove',
    request: AbortController,
    rows: readonly Readonly<TRow>[],
    targets: readonly Readonly<EditorOperationTarget>[],
  ): Promise<boolean>;
  public async runBeforeOpen(
    operation: 'create' | 'edit' | 'batchEdit' | 'remove',
    request: AbortController,
    rowOrRows?: Readonly<TRow> | readonly Readonly<TRow>[],
    targetOrTargets?:
      Readonly<EditorOperationTarget> | readonly Readonly<EditorOperationTarget>[],
  ): Promise<boolean> {
    const hook = this.arguments_.options.hooks?.beforeOpen;
    if (hook === undefined) {
      return true;
    }

    const { signal } = request;
    let context: BeforeOpenContext<TRow, TFormValues>;
    let errorContext: EditorErrorHookContext;
    if (operation === 'edit') {
      const row = rowOrRows as Readonly<TRow>;
      const target = targetOrTargets as Readonly<EditorOperationTarget>;
      context = Object.freeze({
        mode: 'dialog',
        operation,
        row,
        signal,
        target,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
        target,
      };
    } else if (operation === 'batchEdit') {
      const originals = rowOrRows as readonly Readonly<TRow>[];
      const targets = targetOrTargets as readonly Readonly<EditorOperationTarget>[];
      context = Object.freeze({
        mode: 'dialog',
        operation,
        originals,
        signal,
        targets,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
        targets,
      };
    } else if (operation === 'remove') {
      const rows = rowOrRows as readonly Readonly<TRow>[];
      const targets = targetOrTargets as readonly Readonly<EditorOperationTarget>[];
      context = Object.freeze({
        mode: 'dialog',
        operation,
        rows,
        signal,
        targets,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
      };
    } else {
      context = Object.freeze({
        mode: 'dialog',
        operation,
        signal,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
      };
    }

    try {
      const shouldOpen = await Promise.resolve(hook(context));
      signal.throwIfAborted();
      this.assertCurrent(request);
      return shouldOpen !== false;
    } catch (rawError: unknown) {
      const error = normalizeOperationError(rawError, signal, this.arguments_.language);
      if (error instanceof InternalOperationAbort) {
        return false;
      }
      this.arguments_.errorReporter.report(error, errorContext, true);
      throw error;
    }
  }

  public destroy(): void {
    this.cancel();
  }
}
