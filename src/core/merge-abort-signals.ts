/** A merged signal with explicit listener cleanup for normal completion. */
export interface MergedAbortSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

/** Returns a signal that aborts when any supplied signal aborts. */
export function mergeAbortSignals(signals: readonly AbortSignal[]): MergedAbortSignal {
  const abortController = new AbortController();
  const listenerBySignal = new Map<AbortSignal, () => void>();
  const dispose = (): void => {
    for (const [signal, listener] of listenerBySignal) {
      signal.removeEventListener('abort', listener);
    }
    listenerBySignal.clear();
  };
  const abortFrom = (signal: AbortSignal): void => {
    if (abortController.signal.aborted) {
      return;
    }
    dispose();
    abortController.abort(signal.reason);
  };

  for (const signal of new Set(signals)) {
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

  return { dispose, signal: abortController.signal };
}
