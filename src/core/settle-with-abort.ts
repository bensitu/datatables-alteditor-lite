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
  if (signal.aborted) {
    return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  }

  return new Promise<TValue>((resolve, reject) => {
    let isSettled = false;
    const release = (): void => {
      signal.removeEventListener('abort', handleAbort);
    };
    const resolveValue = (result: TValue): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      release();
      resolve(result);
    };
    const rejectValue = (error: unknown): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      release();
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- DOMException is a supported cancellation reason
      reject(error);
    };
    const handleAbort = (): void => {
      rejectValue(new DOMException('The request was aborted.', 'AbortError'));
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve(value).then(resolveValue, (error: unknown) => {
      rejectValue(normalizeError(error));
    });
  });
}
