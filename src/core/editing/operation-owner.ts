import { EditorDestroyedError } from '../alt-editor-lite-error.js';
import { RequestSequence } from '../request-sequence.js';

import type {
  BatchEditOperationContext,
  CreateOperationContext,
  EditOperationContext,
  OperationContext,
  RefreshOperationContext,
  RemoveOperationContext,
} from '../alt-editor-lite-options.js';
import type {
  EditorOperation,
  EditorOperationMode,
  EditorOperationTarget,
} from '../editor-operation.js';

/** Request identity shared by dialog, inline, and refresh operations. */
export interface OwnedOperationRequest<
  TOperation extends EditorOperation = EditorOperation,
> {
  readonly abortController: AbortController;
  readonly mode: EditorOperationMode;
  readonly operation: TOperation;
  readonly sequence: number;
  readonly target?: Readonly<EditorOperationTarget>;
  readonly targets?: readonly Readonly<EditorOperationTarget>[];
}

/** Owns one asynchronous editor operation at a time. */
export class OperationOwner {
  private readonly sequence = new RequestSequence();

  private activeRequest: OwnedOperationRequest | undefined;

  private isDestroyed = false;

  /** Begins a request and invalidates any earlier request. */
  public begin(operation: 'create', mode: 'dialog'): OwnedOperationRequest<'create'>;
  public begin(
    operation: 'edit',
    mode: 'dialog' | 'inline',
    target: Readonly<EditorOperationTarget>,
  ): OwnedOperationRequest<'edit'>;
  public begin(
    operation: 'batchEdit',
    mode: 'dialog',
    targets: readonly Readonly<EditorOperationTarget>[],
  ): OwnedOperationRequest<'batchEdit'>;
  public begin(operation: 'remove', mode: 'dialog'): OwnedOperationRequest<'remove'>;
  public begin(operation: 'refresh', mode: 'api'): OwnedOperationRequest<'refresh'>;
  public begin(
    operation: EditorOperation,
    mode: EditorOperationMode,
    targetOrTargets?:
      Readonly<EditorOperationTarget> | readonly Readonly<EditorOperationTarget>[],
  ): OwnedOperationRequest {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
    this.activeRequest?.abortController.abort();
    const request: OwnedOperationRequest = {
      abortController: new AbortController(),
      mode,
      operation,
      sequence: this.sequence.next(),
      ...(Array.isArray(targetOrTargets)
        ? {
            targets: Object.freeze([
              ...(targetOrTargets as readonly Readonly<EditorOperationTarget>[]),
            ]),
          }
        : targetOrTargets === undefined
          ? {}
          : { target: targetOrTargets as Readonly<EditorOperationTarget> }),
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
  public context(request: OwnedOperationRequest<'create'>): CreateOperationContext;
  public context(request: OwnedOperationRequest<'edit'>): EditOperationContext;
  public context(
    request: OwnedOperationRequest<'edit'>,
    operation: 'refresh',
  ): RefreshOperationContext;
  public context(request: OwnedOperationRequest<'batchEdit'>): BatchEditOperationContext;
  public context(request: OwnedOperationRequest<'remove'>): RemoveOperationContext;
  public context(request: OwnedOperationRequest<'refresh'>): RefreshOperationContext;
  public context(
    request: OwnedOperationRequest,
    operation: EditorOperation = request.operation,
  ): OperationContext {
    const signal = request.abortController.signal;
    switch (operation) {
      case 'create': {
        return Object.freeze({ mode: 'dialog', operation, signal });
      }
      case 'edit': {
        if (request.target === undefined || request.mode === 'api') {
          throw new Error('Edit operation context is incomplete.');
        }
        return Object.freeze({
          mode: request.mode,
          operation,
          signal,
          target: request.target,
        });
      }
      case 'batchEdit': {
        if (request.targets === undefined) {
          throw new Error('Batch Edit operation context is incomplete.');
        }
        return Object.freeze({
          mode: 'dialog',
          operation,
          signal,
          targets: request.targets,
        });
      }
      case 'remove': {
        return Object.freeze({ mode: 'dialog', operation, signal });
      }
      case 'refresh': {
        return request.mode === 'inline' && request.target !== undefined
          ? Object.freeze({
              mode: 'inline',
              operation,
              signal,
              target: request.target,
            })
          : Object.freeze({ mode: 'api', operation, signal });
      }
    }
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
