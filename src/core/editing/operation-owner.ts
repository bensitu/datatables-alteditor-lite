import { EditorDestroyedError } from '../alt-editor-lite-error.js';
import { RequestSequence } from '../request-sequence.js';
import { settleWithAbort } from '../settle-with-abort.js';

import type {
  BatchEditOperationContext,
  CreateOperationContext,
  EditOperationContext,
  EditorErrorHookContext,
  OperationContext,
  PersistenceOutcome,
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
  persistenceOutcome: PersistenceOutcome;
  readonly target?: Readonly<EditorOperationTarget>;
  readonly targets?: readonly Readonly<EditorOperationTarget>[];
}

/** Owns one asynchronous editor operation at a time. */
export class OperationOwner {
  readonly #sequence = new RequestSequence();

  #activeRequest: OwnedOperationRequest | undefined;

  #isDestroyed = false;

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
    if (this.#isDestroyed) {
      throw new EditorDestroyedError();
    }
    this.#activeRequest?.abortController.abort();
    const request: OwnedOperationRequest = {
      abortController: new AbortController(),
      mode,
      operation,
      persistenceOutcome: 'not-attempted',
      sequence: this.#sequence.next(),
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
    this.#activeRequest = request;
    return request;
  }

  /** Returns whether a request still owns every asynchronous continuation. */
  public owns(request: OwnedOperationRequest): boolean {
    return (
      !this.#isDestroyed &&
      this.#activeRequest === request &&
      this.#sequence.isCurrent(request.sequence) &&
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
    return Object.freeze({
      ...this.operationDetails(request, operation),
      signal: request.abortController.signal,
    });
  }

  private operationDetails(request: OwnedOperationRequest, operation: EditorOperation) {
    switch (operation) {
      case 'create':
      case 'remove': {
        return { mode: 'dialog', operation } as const;
      }
      case 'edit': {
        if (request.target === undefined || request.mode === 'api') {
          throw new Error('Edit operation context is incomplete.');
        }
        return {
          mode: request.mode,
          operation,
          target: request.target,
        } as const;
      }
      case 'batchEdit': {
        if (request.targets === undefined) {
          throw new Error('Batch Edit operation context is incomplete.');
        }
        return {
          mode: 'dialog',
          operation,
          targets: request.targets,
        } as const;
      }
      case 'refresh': {
        return request.mode === 'inline' && request.target !== undefined
          ? ({
              mode: 'inline',
              operation,
              target: request.target,
            } as const)
          : ({ mode: 'api', operation } as const);
      }
    }
  }

  /** Stops waiting when the owning request is cancelled or destroyed. */
  public wait<T>(request: OwnedOperationRequest, value: T | PromiseLike<T>): Promise<T> {
    return settleWithAbort(value, request.abortController.signal);
  }

  /** Describes a write or presentation failure without exposing the request signal. */
  public errorContext(
    request: OwnedOperationRequest,
    phase: EditorErrorHookContext['phase'],
    committed: boolean,
  ): EditorErrorHookContext {
    return {
      ...this.operationDetails(request, request.operation),
      committed,
      phase,
      persistenceOutcome: request.persistenceOutcome,
    };
  }

  /** Tracks write acknowledgement independently of host application. */
  public async persist<T>(
    request: OwnedOperationRequest,
    write: () => T | PromiseLike<T>,
  ): Promise<T> {
    request.abortController.signal.throwIfAborted();
    request.persistenceOutcome = 'unknown';
    const result = await this.wait(request, write());
    request.persistenceOutcome = 'acknowledged';
    return result;
  }

  /** Completes a request only when it still owns the operation. */
  public complete(request: OwnedOperationRequest): void {
    if (this.#activeRequest === request) {
      this.#activeRequest = undefined;
    }
  }

  /** Aborts the current request, optionally limited to one presentation mode. */
  public abort(mode?: EditorOperationMode): void {
    if (mode !== undefined && this.#activeRequest?.mode !== mode) {
      return;
    }

    this.#activeRequest?.abortController.abort();
    this.#activeRequest = undefined;
    this.#sequence.invalidate();
  }

  /** Invalidates late continuations without changing the destroyed state. */
  public invalidate(): void {
    this.abort();
  }

  /** Permanently aborts and rejects ownership for every request. */
  public destroy(): void {
    if (this.#isDestroyed) {
      return;
    }

    this.abort();
    this.#isDestroyed = true;
  }
}
