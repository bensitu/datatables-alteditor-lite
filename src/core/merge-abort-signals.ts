/** A merged signal with explicit listener cleanup for normal completion. */
export interface MergedAbortSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

/** Returns a signal that aborts when any supplied signal aborts. */
export function mergeAbortSignals(signals: readonly AbortSignal[]): MergedAbortSignal {
  const abortController = new AbortController();
  const registeredSignals: AbortSignal[] = [];
  const dispose = (): void => {
    for (const signal of registeredSignals) {
      signal.removeEventListener('abort', handleAbort);
    }
    registeredSignals.length = 0;
  };
  const abortFrom = (signal: AbortSignal): void => {
    if (abortController.signal.aborted) {
      return;
    }
    dispose();
    abortController.abort(signal.reason);
  };
  const handleAbort = (event: Event): void => {
    abortFrom(event.currentTarget as AbortSignal);
  };

  for (const signal of new Set(signals)) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    registeredSignals.push(signal);
    signal.addEventListener('abort', handleAbort, { once: true });
  }

  return { dispose, signal: abortController.signal };
}
