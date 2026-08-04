import { RequestSequence } from '../request-sequence.js';

import type { OperationContext } from '../alt-editor-lite-options.js';
import type {
  EditorOperation,
  EditorOperationMode,
  EditorOperationTarget,
} from '../editor-operation.js';
import type { Api } from 'datatables.net';

/** Request identity shared by dialog, inline, and refresh operations. */
export interface OwnedOperationRequest {
  readonly abortController: AbortController;
  readonly mode: EditorOperationMode;
  readonly operation: EditorOperation;
  readonly sequence: number;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Owns one asynchronous editor operation at a time. */
export class OperationOwner {
  private readonly sequence = new RequestSequence();

  private activeRequest: OwnedOperationRequest | undefined;

  private isDestroyed = false;

  /** Begins a request and invalidates any earlier request. */
  public begin(
    operation: EditorOperation,
    mode: EditorOperationMode,
    target?: Readonly<EditorOperationTarget>,
  ): OwnedOperationRequest {
    this.abort();
    const request: OwnedOperationRequest = {
      abortController: new AbortController(),
      mode,
      operation,
      sequence: this.sequence.next(),
      ...(target === undefined ? {} : { target }),
    };
    this.activeRequest = request;
    return request;
  }

  /** Returns whether a request still owns every asynchronous continuation. */
  public owns(request: OwnedOperationRequest): boolean {
    return (
      !this.isDestroyed &&
      this.activeRequest === request &&
      this.sequence.isCurrent(request.sequence) &&
      !request.abortController.signal.aborted
    );
  }

  /** Creates the public callback context for an owned request. */
  public context<TRow extends object>(
    table: Api<TRow>,
    request: OwnedOperationRequest,
    operation: EditorOperation = request.operation,
  ): OperationContext<TRow> {
    return Object.freeze({
      mode: request.mode,
      operation,
      signal: request.abortController.signal,
      table,
      ...(request.target === undefined ? {} : { target: request.target }),
    });
  }

  /** Completes a request only when it still owns the operation. */
  public complete(request: OwnedOperationRequest): void {
    if (this.activeRequest === request) {
      this.activeRequest = undefined;
    }
  }

  /** Aborts the current request, optionally limited to one presentation mode. */
  public abort(mode?: EditorOperationMode): void {
    if (mode !== undefined && this.activeRequest?.mode !== mode) {
      return;
    }

    this.activeRequest?.abortController.abort();
    this.activeRequest = undefined;
    this.sequence.invalidate();
  }

  /** Invalidates late continuations without changing the destroyed state. */
  public invalidate(): void {
    this.abort();
  }

  /** Permanently aborts and rejects ownership for every request. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.abort();
    this.isDestroyed = true;
  }
}
