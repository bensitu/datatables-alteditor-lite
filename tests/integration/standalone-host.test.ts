import { describe, expect, it, vi } from 'vitest';

import { EditorDestroyedError } from '../../src/core/alt-editor-lite-error.js';
import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { hasHostBatchUpdateCapability } from '../../src/host/editor-host.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import {
  describeEditorHostContract,
  type HostContractRecord,
} from './editor-host-contract.js';

import type { StandaloneHostOptions } from '../../src/standalone/standalone-host.js';

function createRecordHost(
  overrides: Partial<StandaloneHostOptions<HostContractRecord, string>> = {},
  includeBatchApplication = true,
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
    ...(includeBatchApplication
      ? {
          applyUpdates: (
            updates: readonly Readonly<{
              row: HostContractRecord;
              target: string;
            }>[],
          ) => {
            for (const { row, target } of updates) {
              records.set(target, row);
            }
          },
        }
      : {}),
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
  it('releases editor ownership when the initial presentation notification fails', () => {
    const host = Object.assign(createRecordHost(), {
      completeEditorPresentation: vi.fn(),
      notifyEditorStateChange: vi.fn<() => void>(() => {
        throw new Error('Presentation unavailable.');
      }),
    });
    const options = {
      fields: [{ type: 'text' as const, name: 'name' as const, label: 'Name' }],
    };
    expect(() => new AltEditorLite(host, options)).toThrow('Presentation unavailable.');
    host.notifyEditorStateChange.mockImplementation(() => undefined);
    const editor = new AltEditorLite(host, options);
    editor.destroy();
  });

  it('requires a refresh callback unless an operation supplies the action', async () => {
    const host = createRecordHost();
    const signal = new AbortController().signal;
    await expect(host.refresh(signal)).rejects.toThrow('refresh');
    const action = vi.fn(() => Promise.resolve());
    await host.refresh(signal, action);
    expect(action).toHaveBeenCalledOnce();
    host.destroy();
  });

  it('reports destruction while refresh is preparing', async () => {
    const editor = new AltEditorLite(createRecordHost(), { fields: [] });
    const refresh = editor.refresh();
    editor.destroy();
    await expect(refresh).rejects.toBeInstanceOf(EditorDestroyedError);
  });

  it('does not notify error observers after destruction during a success callback', async () => {
    let rejectSuccess: ((error: Error) => void) | undefined;
    const pendingSuccess = new Promise<void>((_resolve, reject) => {
      rejectSuccess = reject;
    });
    const afterSuccess = vi.fn(() => pendingSuccess);
    const onError = vi.fn();
    const editor = new AltEditorLite(createRecordHost({ refresh: () => undefined }), {
      fields: [],
      hooks: { afterSuccess, onError },
    });
    const refresh = editor.refresh();
    await vi.waitFor(() => {
      expect(afterSuccess).toHaveBeenCalledOnce();
    });
    editor.destroy();
    rejectSuccess?.(new Error('Observer unavailable.'));
    await refresh;
    expect(onError).not.toHaveBeenCalled();
  });

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

  it('exposes batch application only when the consumer supplies it', async () => {
    const applyUpdates = vi.fn();
    const host = createRecordHost({ applyUpdates });
    const hostWithoutBatchApplication = createRecordHost({}, false);
    const replacement = { id: 'row-a', name: 'Updated', rank: 2 };

    expect(hasHostBatchUpdateCapability(host)).toBe(true);
    expect(hasHostBatchUpdateCapability(hostWithoutBatchApplication)).toBe(false);
    if (!hasHostBatchUpdateCapability(host)) {
      throw new Error('Expected Standalone batch application support.');
    }
    await host.applyUpdates([{ row: replacement, target: 'row-a' }], {
      mode: 'dialog',
      operation: 'batchEdit',
      signal: new AbortController().signal,
    });

    expect(applyUpdates).toHaveBeenCalledWith(
      [{ row: replacement, target: 'row-a' }],
      expect.objectContaining({ operation: 'batchEdit' }),
    );
    host.destroy();
    hostWithoutBatchApplication.destroy();
  });
});
