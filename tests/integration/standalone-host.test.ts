import { describe, expect, it } from 'vitest';

import { EditorDestroyedError } from '../../src/core/alt-editor-lite-error.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import {
  describeEditorHostContract,
  type HostContractRecord,
} from './editor-host-contract.js';

import type { StandaloneHostOptions } from '../../src/standalone/standalone-host.js';

function createRecordHost(
  overrides: Partial<StandaloneHostOptions<HostContractRecord, string>> = {},
): StandaloneHost<HostContractRecord, string> {
  const records = new Map<string, HostContractRecord>([
    ['row-a', { id: 'row-a', name: 'Alpha', rank: 1 }],
  ]);

  return new StandaloneHost({
    applyCreate: (row) => {
      records.set(row.id, row);
      return row.id;
    },
    applyRemove: (targets) => {
      for (const target of targets) {
        records.delete(target);
      }
    },
    applyUpdate: (target, row) => {
      records.set(target, row);
      return target;
    },
    read: (target) => {
      const row = records.get(target);
      if (row === undefined) {
        throw new Error('The requested record is unavailable.');
      }
      return row;
    },
    ...overrides,
  });
}

describeEditorHostContract('StandaloneHost', () => {
  const eventTarget = new EventTarget();
  const host = createRecordHost({ eventTarget });
  return { eventTarget, host, initialTarget: 'row-a' };
});

describe('StandaloneHost lifecycle', () => {
  it('settles an application only after the consumer callback completes', async () => {
    let completeApplication: (() => void) | undefined;
    const callbackCompletion = new Promise<void>((resolve) => {
      completeApplication = resolve;
    });
    const host = createRecordHost({
      applyCreate: async (row) => {
        await callbackCompletion;
        return row.id;
      },
    });
    let isSettled = false;

    const application = host
      .applyCreate(
        { id: 'row-created', name: 'Created', rank: 10 },
        {
          mode: 'api',
          operation: 'create',
          signal: new AbortController().signal,
        },
      )
      .then(() => {
        isSettled = true;
      });
    await Promise.resolve();
    expect(isSettled).toBe(false);

    completeApplication?.();
    await application;
    expect(isSettled).toBe(true);
    host.destroy();
  });

  it('rejects record access after resources are released', () => {
    const host = createRecordHost();

    host.destroy();
    host.destroy();

    expect(() => host.read('row-a')).toThrow(EditorDestroyedError);
  });
});
