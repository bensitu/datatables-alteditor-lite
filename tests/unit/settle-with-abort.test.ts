import { describe, expect, it, vi } from 'vitest';

import { settleWithAbort } from '../../src/core/settle-with-abort.js';

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value);
    },
  };
}

describe('settleWithAbort', () => {
  it('rejects an already cancelled request without registering a listener', async () => {
    const controller = new AbortController();
    controller.abort();
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener');

    await expect(settleWithAbort('value', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('releases its cancellation listener after normal settlement', async () => {
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');

    await expect(
      settleWithAbort(Promise.resolve('value'), controller.signal),
    ).resolves.toBe('value');
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects promptly after cancellation and supports rejection normalization', async () => {
    const pending = createDeferred<string>();
    const controller = new AbortController();
    const request = settleWithAbort(pending.promise, controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve('late');
    await expect(
      settleWithAbort(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- verifies normalization of consumer-provided rejection values
        Promise.reject('reason'),
        new AbortController().signal,
        (error) => new Error('Resolver failed.', { cause: error }),
      ),
    ).rejects.toMatchObject({ cause: 'reason', message: 'Resolver failed.' });
  });
});
