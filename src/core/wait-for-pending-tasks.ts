import { settleWithAbort } from './settle-with-abort.js';

/** Waits for tracked work, including tasks added while the current work settles. */
export async function waitForPendingTasks(
  getTasks: () => Iterable<PromiseLike<unknown>>,
  signal: AbortSignal,
): Promise<void> {
  for (let tasks = [...getTasks()]; tasks.length > 0; tasks = [...getTasks()]) {
    await settleWithAbort(Promise.allSettled(tasks), signal);
  }
}
