import { describe, expect, it } from 'vitest';

import { SearchSelectRemoteDataController } from '../../src/search-select/search-select-remote-data-controller.js';

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

describe('SearchSelectRemoteDataController', () => {
  it('returns successful, synchronous failure, and asynchronous failure results', async () => {
    const synchronousFailure = new Error('Synchronous failure.');
    const asynchronousFailure = new Error('Asynchronous failure.');
    const controller = new SearchSelectRemoteDataController<string>(
      (query) => {
        if (query === 'throw') {
          throw synchronousFailure;
        }
        if (query === 'reject') {
          return Promise.reject(asynchronousFailure);
        }
        return [{ label: 'Tokyo', value: 'tokyo' }];
      },
      (value) => ({ label: value, value }),
    );

    await expect(controller.search('tokyo')).resolves.toEqual([
      'ok',
      [{ label: 'Tokyo', value: 'tokyo' }],
    ]);
    await expect(controller.search('throw')).resolves.toEqual(['error']);
    await expect(controller.search('reject')).resolves.toEqual(['error']);
    await expect(controller.resolve('osaka')).resolves.toEqual([
      'ok',
      { label: 'osaka', value: 'osaka' },
    ]);
  });

  it('cancels replaced requests without coupling search and resolve channels', async () => {
    const firstSearch =
      createDeferred<readonly { readonly label: string; readonly value: string }[]>();
    const secondSearch =
      createDeferred<readonly { readonly label: string; readonly value: string }[]>();
    const firstResolve = createDeferred<{
      readonly label: string;
      readonly value: string;
    }>();
    const secondResolve = createDeferred<{
      readonly label: string;
      readonly value: string;
    }>();
    const searchSignals: AbortSignal[] = [];
    const resolveSignals: AbortSignal[] = [];
    const controller = new SearchSelectRemoteDataController<string>(
      (query, { signal }) => {
        searchSignals.push(signal);
        return query === 'first' ? firstSearch.promise : secondSearch.promise;
      },
      (value, { signal }) => {
        resolveSignals.push(signal);
        return value === 'first' ? firstResolve.promise : secondResolve.promise;
      },
    );

    const staleSearch = controller.search('first');
    const currentSearch = controller.search('second');
    const staleResolve = controller.resolve('first');
    const currentResolve = controller.resolve('second');

    expect(searchSignals[0]?.aborted).toBe(true);
    expect(searchSignals[1]?.aborted).toBe(false);
    expect(resolveSignals[0]?.aborted).toBe(true);
    expect(resolveSignals[1]?.aborted).toBe(false);

    firstSearch.resolve([{ label: 'Stale', value: 'stale' }]);
    firstResolve.resolve({ label: 'Stale', value: 'stale' });
    secondSearch.resolve([{ label: 'Current', value: 'current' }]);
    secondResolve.resolve({ label: 'Current', value: 'second' });

    await expect(staleSearch).resolves.toBeUndefined();
    await expect(staleResolve).resolves.toBeUndefined();
    await expect(currentSearch).resolves.toEqual([
      'ok',
      [{ label: 'Current', value: 'current' }],
    ]);
    await expect(currentResolve).resolves.toEqual([
      'ok',
      { label: 'Current', value: 'second' },
    ]);
  });

  it('cancels each pending channel explicitly or during destruction', async () => {
    const search =
      createDeferred<readonly { readonly label: string; readonly value: string }[]>();
    const resolve = createDeferred<{
      readonly label: string;
      readonly value: string;
    }>();
    let searchSignal: AbortSignal | undefined;
    let resolveSignal: AbortSignal | undefined;
    const controller = new SearchSelectRemoteDataController<string>(
      (_query, { signal }) => {
        searchSignal = signal;
        return search.promise;
      },
      (_value, { signal }) => {
        resolveSignal = signal;
        return resolve.promise;
      },
    );
    const searchResult = controller.search('query');
    const resolveResult = controller.resolve('value');

    controller.cancel(0);
    expect(searchSignal?.aborted).toBe(true);
    expect(resolveSignal?.aborted).toBe(false);
    controller.destroy();
    expect(resolveSignal?.aborted).toBe(true);

    search.resolve([]);
    resolve.resolve({ label: 'Late', value: 'value' });
    await expect(searchResult).resolves.toBeUndefined();
    await expect(resolveResult).resolves.toBeUndefined();
  });
});
