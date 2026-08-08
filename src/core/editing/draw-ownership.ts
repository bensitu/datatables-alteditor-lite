import { EditorDestroyedError } from '../alt-editor-lite-error.js';

import type { Api } from 'datatables.net';

/** Reason associated with a DataTables draw owned by the editor. */
export type DrawOwnershipReason =
  'dialog-edit-success' | 'inline-edit-success' | 'refresh';

/** Logical identity of the currently owned draw. */
export interface DrawOwnershipToken {
  readonly sequence: number;
  readonly reason: DrawOwnershipReason;
}

/** Distinguishes editor commit draws from unrelated DataTables redraws. */
export class DrawOwnership<TRow extends object> {
  private activeToken: DrawOwnershipToken | undefined;

  private sequence = 0;

  private isDestroyed = false;

  private readonly lifecycleAbortController = new AbortController();

  private readonly pendingDraws = new Set<() => void>();

  public constructor(private readonly table: Api<TRow>) {}

  /** Returns whether a draw event is currently owned by the editor. */
  public ownsDraw(): boolean {
    return this.activeToken !== undefined;
  }

  /** Runs a synchronous draw and resolves after its public draw event. */
  public async runWithDraw(
    reason: DrawOwnershipReason,
    signal: AbortSignal,
    draw: () => void,
  ): Promise<void> {
    this.assertActive();
    const token = this.acquire(reason);
    if (signal.aborted) {
      this.release(token);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let isSettled = false;
      let isInvokingDraw = false;
      let didDraw = false;
      const cleanup = (): void => {
        signal.removeEventListener('abort', handleAbort);
        this.table.off('draw.altEditorLiteOwnedDraw', handleDraw);
        this.pendingDraws.delete(finish);
      };
      const finish = (): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        cleanup();
        resolve();
      };
      const handleAbort = (): void => {
        finish();
      };
      const handleDraw = (): void => {
        if (isInvokingDraw) {
          didDraw = true;
          return;
        }
        finish();
      };

      this.pendingDraws.add(finish);
      signal.addEventListener('abort', handleAbort, { once: true });
      this.table.one('draw.altEditorLiteOwnedDraw', handleDraw);
      if (signal.aborted) {
        finish();
        return;
      }
      try {
        isInvokingDraw = true;
        draw();
        isInvokingDraw = false;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- DataTables can dispatch the registered listener synchronously inside draw().
        if (didDraw) {
          finish();
        }
      } catch (error: unknown) {
        isInvokingDraw = false;
        isSettled = true;
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error('DataTables draw failed.', { cause: error }),
        );
      }
    }).finally(() => {
      this.release(token);
    });
  }

  /** Marks redraws performed by a consumer-owned asynchronous refresh. */
  public async runWhile(
    reason: DrawOwnershipReason,
    signal: AbortSignal,
    action: () => Promise<void>,
  ): Promise<void> {
    this.assertActive();
    const token = this.acquire(reason);
    try {
      if (signal.aborted) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        let isSettled = false;
        const lifecycleSignal = this.lifecycleAbortController.signal;
        const cleanup = (): void => {
          signal.removeEventListener('abort', handleAbort);
          lifecycleSignal.removeEventListener('abort', handleAbort);
        };
        const settle = (callback: () => void): void => {
          if (isSettled) {
            return;
          }
          isSettled = true;
          cleanup();
          callback();
        };
        const handleAbort = (): void => {
          settle(resolve);
        };

        signal.addEventListener('abort', handleAbort, { once: true });
        lifecycleSignal.addEventListener('abort', handleAbort, { once: true });
        void action().then(
          () => {
            settle(resolve);
          },
          (error: unknown) => {
            settle(() => {
              reject(
                error instanceof Error
                  ? error
                  : new Error('Asynchronous refresh failed.', { cause: error }),
              );
            });
          },
        );
        if (signal.aborted || lifecycleSignal.aborted) {
          handleAbort();
        }
      });
    } finally {
      this.release(token);
    }
  }

  /** Releases resources and prevents future owned draws. */
  public destroy(): void {
    this.isDestroyed = true;
    this.lifecycleAbortController.abort();
    this.sequence += 1;
    this.activeToken = undefined;
    for (const finish of [...this.pendingDraws]) {
      finish();
    }
    this.table.off('.altEditorLiteOwnedDraw');
  }

  private acquire(reason: DrawOwnershipReason): DrawOwnershipToken {
    this.sequence += 1;
    const token = Object.freeze({ reason, sequence: this.sequence });
    this.activeToken = token;
    return token;
  }

  private release(token: DrawOwnershipToken): void {
    if (this.activeToken === token) {
      this.activeToken = undefined;
    }
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }
}
