import { describe, expect, it, vi } from 'vitest';

import { readHostRecord, readHostRecords } from '../../src/host/host-record-reader.js';

import type { EditorHost } from '../../src/host/editor-host.js';

interface TestRow {
  readonly id: string;
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  reject(reason: unknown): void;
  resolve(value: TValue): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return {
    promise,
    reject: (reason) => {
      rejectPromise?.(reason);
    },
    resolve: (value) => {
      resolvePromise?.(value);
    },
  };
}

function createHost(
  read: EditorHost<TestRow, string>['read'],
): EditorHost<TestRow, string> {
  return { read } as EditorHost<TestRow, string>;
}

describe('Host record reader', () => {
  it('invokes the Host before observing an already-aborted signal', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const read = vi.fn(() => ({ id: 'record-a' }));

    await expect(
      readHostRecord(createHost(read), 'record-a', abortController.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(read).toHaveBeenCalledWith('record-a', {
      signal: abortController.signal,
    });
  });

  it('starts all reads immediately and returns rows in target order', async () => {
    const first = createDeferred<Readonly<TestRow>>();
    const second = createDeferred<Readonly<TestRow>>();
    const reads: string[] = [];
    const host = createHost((target) => {
      reads.push(target);
      return target === 'record-a' ? first.promise : second.promise;
    });

    const result = readHostRecords(
      host,
      ['record-a', 'record-b'],
      new AbortController().signal,
    );
    expect(reads).toEqual(['record-a', 'record-b']);

    second.resolve({ id: 'record-b' });
    first.resolve({ id: 'record-a' });
    await expect(result).resolves.toEqual([{ id: 'record-a' }, { id: 'record-b' }]);
  });

  it('limits concurrent reads while preserving every result position', async () => {
    const releaseReads = createDeferred<undefined>();
    const targets = Array.from({ length: 40 }, (_, index) => `record-${String(index)}`);
    let activeReads = 0;
    let highestActiveReads = 0;
    const host = createHost(async (target) => {
      activeReads += 1;
      highestActiveReads = Math.max(highestActiveReads, activeReads);
      await releaseReads.promise;
      activeReads -= 1;
      return { id: target };
    });

    const result = readHostRecords(host, targets, new AbortController().signal);
    await vi.waitFor(() => {
      expect(activeReads).toBe(16);
    });
    releaseReads.resolve(undefined);

    await expect(result).resolves.toEqual(targets.map((id) => ({ id })));
    expect(highestActiveReads).toBe(16);
  });

  it('invokes later targets when an earlier read throws synchronously', async () => {
    const reads: string[] = [];
    const host = createHost((target) => {
      reads.push(target);
      if (target === 'record-a') {
        throw new Error('Record A is unavailable.');
      }
      return { id: target };
    });

    await expect(
      readHostRecords(host, ['record-a', 'record-b'], new AbortController().signal),
    ).rejects.toThrow('Record A is unavailable.');
    expect(reads).toEqual(['record-a', 'record-b']);
  });

  it('stops scheduling queued reads after one read fails', async () => {
    const failedRead = createDeferred<Readonly<TestRow>>();
    const releaseReads = createDeferred<undefined>();
    const targets = Array.from({ length: 40 }, (_, index) => `record-${String(index)}`);
    const reads: string[] = [];
    const host = createHost(async (target) => {
      reads.push(target);
      if (target === 'record-0') {
        return await failedRead.promise;
      }
      await releaseReads.promise;
      return { id: target };
    });

    const result = readHostRecords(host, targets, new AbortController().signal);
    await vi.waitFor(() => {
      expect(reads).toHaveLength(16);
    });
    failedRead.reject(new Error('Record 0 is unavailable.'));

    await expect(result).rejects.toThrow('Record 0 is unavailable.');
    expect(reads).toEqual(targets.slice(0, 16));
    releaseReads.resolve(undefined);
  });
});
