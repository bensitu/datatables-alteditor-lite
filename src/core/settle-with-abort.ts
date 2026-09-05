import { normalizeRejectedReason } from './error-normalization.js';

type SettlementError = DOMException | Error;

function normalizeRejection(error: unknown): SettlementError {
  return error instanceof DOMException ? error : normalizeRejectedReason(error);
}

/** Settles a direct or promise-like value, rejecting promptly when cancelled. */
export function settleWithAbort<TValue>(
  value: TValue | PromiseLike<TValue>,
  signal: AbortSignal,
  normalizeError: (error: unknown) => SettlementError = normalizeRejection,
): Promise<TValue> {
  return new Promise<TValue>((resolve, reject) => {
    let settlement:
      | {
          readonly signal: AbortSignal;
          readonly resolve: (result: TValue) => void;
          readonly reject: (reason?: unknown) => void;
        }
      | undefined = { signal, resolve, reject };
    const release = (): typeof settlement => {
      const current = settlement;
      settlement = undefined;
      current?.signal.removeEventListener('abort', handleAbort);
      return current;
    };
    const handleAbort = (): void => {
      release()?.reject(new DOMException('The request was aborted.', 'AbortError'));
    };

    if (signal.aborted) {
      handleAbort();
    } else {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
    void Promise.resolve(value).then(
      (result) => release()?.resolve(result),
      (error: unknown) => release()?.reject(normalizeError(error)),
    );
  });
}
