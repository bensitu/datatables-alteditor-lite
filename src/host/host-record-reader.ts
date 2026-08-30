import { settleWithAbort } from '../core/settle-with-abort.js';

import type { EditorHost } from './editor-host.js';

const MAX_CONCURRENT_READS = 16;

/** Reads one Host record with cancellation-aware settlement. */
export async function readHostRecord<TRow extends object, TTarget>(
  host: EditorHost<TRow, TTarget>,
  target: TTarget,
  signal: AbortSignal,
): Promise<Readonly<TRow>> {
  const row = await settleWithAbort(host.read(target, { signal }), signal);
  signal.throwIfAborted();
  return row;
}

/** Reads Host records with bounded concurrency while retaining target order. */
export async function readHostRecords<TRow extends object, TTarget>(
  host: EditorHost<TRow, TTarget>,
  targets: readonly TTarget[],
  signal: AbortSignal,
): Promise<readonly Readonly<TRow>[]> {
  const rows = new Array<Readonly<TRow>>(targets.length);
  let nextIndex = 0;
  const readNext = async (): Promise<void> => {
    let index = nextIndex;
    while (index < targets.length) {
      nextIndex += 1;
      try {
        rows[index] = await readHostRecord(host, targets[index] as TTarget, signal);
      } catch (error: unknown) {
        nextIndex = targets.length;
        throw error;
      }
      index = nextIndex;
    }
  };
  await Promise.all(targets.slice(0, MAX_CONCURRENT_READS).map(readNext));
  return rows;
}
