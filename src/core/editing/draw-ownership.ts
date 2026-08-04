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
    await new Promise<void>((resolve, reject) => {
      let isSettled = false;
      const finish = (): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        signal.removeEventListener('abort', handleAbort);
        this.table.off('draw.altEditorLiteOwnedDraw', handleDraw);
        resolve();
      };
      const handleAbort = (): void => {
        finish();
      };
      const handleDraw = (): void => {
        finish();
      };

      signal.addEventListener('abort', handleAbort, { once: true });
      this.table.one('draw.altEditorLiteOwnedDraw', handleDraw);
      try {
        draw();
      } catch (error: unknown) {
        isSettled = true;
        signal.removeEventListener('abort', handleAbort);
        this.table.off('draw.altEditorLiteOwnedDraw', handleDraw);
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
    action: () => Promise<void>,
  ): Promise<void> {
    this.assertActive();
    const token = this.acquire(reason);
    try {
      await action();
    } finally {
      this.release(token);
    }
  }

  /** Releases resources and prevents future owned draws. */
  public destroy(): void {
    this.isDestroyed = true;
    this.sequence += 1;
    this.activeToken = undefined;
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
