/** Returns a signal that aborts when any supplied signal aborts. */
export function mergeAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  const abortController = new AbortController();
  const listenerBySignal = new Map<AbortSignal, () => void>();
  const cleanup = (): void => {
    for (const [signal, listener] of listenerBySignal) {
      signal.removeEventListener('abort', listener);
    }
    listenerBySignal.clear();
  };
  const abortFrom = (signal: AbortSignal): void => {
    if (abortController.signal.aborted) {
      return;
    }
    cleanup();
    abortController.abort(signal.reason);
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    const listener = (): void => {
      abortFrom(signal);
    };
    listenerBySignal.set(signal, listener);
    signal.addEventListener('abort', listener, { once: true });
  }

  return abortController.signal;
}
