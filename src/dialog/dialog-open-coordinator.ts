import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { settleWithAbort } from '../core/settle-with-abort.js';
import { readHostRecords } from '../host/host-record-reader.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { EditorHost } from '../host/editor-host.js';

type DialogOpenDetails<TRow extends object> =
  | { readonly operation: 'create' }
  | {
      readonly operation: 'edit';
      readonly row: Readonly<TRow>;
      readonly target: Readonly<EditorOperationTarget>;
    }
  | {
      readonly operation: 'batchEdit';
      readonly originals: readonly Readonly<TRow>[];
      readonly targets: readonly Readonly<EditorOperationTarget>[];
    }
  | {
      readonly operation: 'remove';
      readonly rows: readonly Readonly<TRow>[];
      readonly targets: readonly Readonly<EditorOperationTarget>[];
    };

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
  #activeRequest: AbortController | undefined;

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
    this.#activeRequest = request;
    return request;
  }

  public get signal(): AbortSignal {
    if (this.#activeRequest === undefined) {
      throw new DOMException('The open request was cancelled.', 'AbortError');
    }
    return this.#activeRequest.signal;
  }

  public complete(request: AbortController | undefined): void {
    if (this.#activeRequest === request) {
      this.#activeRequest = undefined;
    }
  }

  public cancel(): void {
    this.#activeRequest?.abort();
    this.#activeRequest = undefined;
  }

  public assertCurrent(request: AbortController): void {
    if (this.#activeRequest !== request || request.signal.aborted) {
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

  public async runBeforeOpen(
    details: DialogOpenDetails<TRow>,
    request: AbortController,
  ): Promise<boolean> {
    const hook = this.arguments_.options.hooks?.beforeOpen;
    if (hook === undefined) return true;
    const { signal } = request;
    const context = Object.freeze({ ...details, mode: 'dialog' as const, signal });
    const errorContext: EditorErrorHookContext = {
      committed: false,
      mode: 'dialog',
      phase: 'open',
      ...(details.operation === 'edit'
        ? { operation: details.operation, target: details.target }
        : details.operation === 'batchEdit'
          ? { operation: details.operation, targets: details.targets }
          : { operation: details.operation }),
    };

    try {
      const shouldOpen = await settleWithAbort(hook(context), signal);
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
