import { settleWithAbort } from '../core/settle-with-abort.js';

import type { EditorHost } from './editor-host.js';

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

/** Reads Host records concurrently while retaining target order. */
export function readHostRecords<TRow extends object, TTarget>(
  host: EditorHost<TRow, TTarget>,
  targets: readonly TTarget[],
  signal: AbortSignal,
): Promise<readonly Readonly<TRow>[]> {
  return Promise.all(
    targets.map(async (target) => await readHostRecord(host, target, signal)),
  );
}
