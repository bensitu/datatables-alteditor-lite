/** Settles a direct or promise-like value, rejecting promptly when cancelled. */
export function settleWithAbort<TValue>(
  value: TValue | PromiseLike<TValue>,
  signal: AbortSignal,
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
      reject(
        error instanceof Error || error instanceof DOMException
          ? error
          : new Error('The request failed.', { cause: error }),
      );
    };
    const handleAbort = (): void => {
      rejectValue(new DOMException('The request was aborted.', 'AbortError'));
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve(value).then(resolveValue, rejectValue);
  });
}
