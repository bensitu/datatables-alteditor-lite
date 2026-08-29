import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EditorDestroyedError } from '../../src/core/alt-editor-lite-error.js';

import {
  createStandaloneTestFixture,
  destroyStandaloneTestFixtures,
  installDialogElementSupport,
  type StandaloneRecord,
} from './standalone-test-fixture.js';

describe('AltEditorLite asynchronous Host reads', () => {
  let restoreDialogElement: () => void;

  beforeAll(() => {
    restoreDialogElement = installDialogElementSupport();
  });

  afterAll(() => {
    restoreDialogElement();
  });

  afterEach(() => {
    destroyStandaloneTestFixtures();
  });

  it('opens an Edit dialog after an asynchronous record resolves', async () => {
    const readSignals: AbortSignal[] = [];
    const fixture = createStandaloneTestFixture(
      {},
      {
        read: async (_target, context) => {
          if (context !== undefined) {
            readSignals.push(context.signal);
          }
          await Promise.resolve();
          return { id: 'record-a', name: 'Async Alpha' };
        },
      },
    );

    await fixture.editor.openEditDialog('record-a');

    expect(
      document.querySelector<HTMLInputElement>('.alteditor-lite-form input')?.value,
    ).toBe('Async Alpha');
    expect(readSignals).toHaveLength(2);
    expect(readSignals.every((signal) => !signal.aborted)).toBe(true);
  });

  it('revalidates and reloads canonical values when Edit remains open', async () => {
    let record: StandaloneRecord = { id: 'record-a', name: 'Alpha' };
    const reads: { readonly signal: AbortSignal | undefined; readonly target: string }[] =
      [];
    const update = vi.fn((values: Readonly<Partial<StandaloneRecord>>) => ({
      id: 'record-a',
      name: `${values.name ?? ''} from service`,
    }));
    const fixture = createStandaloneTestFixture(
      {
        editing: { dialog: { closeOnSuccess: false, enabled: true } },
        operations: { update },
      },
      {
        applyUpdate: (target, row) => {
          record = row;
          return target;
        },
        read: async (target, context) => {
          reads.push({ signal: context?.signal, target });
          await Promise.resolve();
          return record;
        },
      },
    );

    await fixture.editor.openEditDialog('record-a');
    fixture.editor.getField('name')?.setValue('Updated Alpha');
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('open');
      expect(
        document.querySelector<HTMLInputElement>('.alteditor-lite-form input')?.value,
      ).toBe('Updated Alpha from service');
    });
    expect(update).toHaveBeenCalledOnce();
    expect(reads).toHaveLength(6);
    expect(reads.every(({ signal }) => signal instanceof AbortSignal)).toBe(true);
    expect(reads.map(({ target }) => target)).toEqual([
      'record-a',
      'record-a',
      'record-a',
      'record-a',
      'record-a',
      'record-a',
    ]);
  });

  it('keeps a committed Edit active when its canonical reload fails', async () => {
    let record: StandaloneRecord = { id: 'record-a', name: 'Alpha' };
    let shouldFailNextCommittedRead = true;
    let didApplyUpdate = false;
    const appliedTargets: string[] = [];
    const afterSuccess = vi.fn();
    const onError = vi.fn();
    const successListener = vi.fn();
    const update = vi.fn(
      (
        values: Readonly<Partial<StandaloneRecord>>,
        original: Readonly<StandaloneRecord>,
      ) => ({
        ...original,
        name: `${values.name ?? ''} from service`,
      }),
    );
    const fixture = createStandaloneTestFixture(
      {
        editing: { dialog: { closeOnSuccess: false, enabled: true } },
        hooks: { afterSuccess, onError },
        operations: { update },
      },
      {
        applyUpdate: (target, row) => {
          appliedTargets.push(target);
          record = row;
          didApplyUpdate = true;
          return appliedTargets.length === 1 ? 'record-b' : target;
        },
        read: async () => {
          await Promise.resolve();
          if (didApplyUpdate && shouldFailNextCommittedRead) {
            didApplyUpdate = false;
            shouldFailNextCommittedRead = false;
            throw new Error('Canonical reload unavailable.');
          }
          return record;
        },
      },
    );
    fixture.host.eventTarget.addEventListener('alteditor-lite:success', successListener);

    await fixture.editor.openEditDialog('record-a');
    fixture.editor.getField('name')?.setValue('First update');
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(afterSuccess).toHaveBeenCalledOnce();
    });
    expect(successListener).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ committed: true, operation: 'edit', phase: 'commit' }),
    );
    expect(fixture.editor.getState()).toMatchObject({ action: 'edit', status: 'open' });

    fixture.editor.getField('name')?.setValue('Second update');
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(afterSuccess).toHaveBeenCalledTimes(2);
    });
    expect(appliedTargets).toEqual(['record-a', 'record-b']);
    expect(update.mock.calls[1]?.[1]).toMatchObject({
      id: 'record-a',
      name: 'First update from service',
    });
  });

  it('keeps committed multi-record changes when a retained reload fails', async () => {
    const records = new Map<string, StandaloneRecord>([
      ['record-a', { id: 'record-a', name: 'Alpha' }],
      ['record-b', { id: 'record-b', name: 'Beta' }],
    ]);
    let didApplyUpdate = false;
    let shouldFailNextCommittedRead = true;
    const afterSuccess = vi.fn();
    const onError = vi.fn();
    const successListener = vi.fn();
    const fixture = createStandaloneTestFixture(
      {
        editing: { dialog: { closeOnSuccess: false, enabled: true } },
        hooks: { afterSuccess, onError },
        operations: {
          updateMany: (changes, originals) =>
            originals.map((original) => ({
              ...original,
              name: changes.name ?? original.name,
            })),
        },
      },
      {
        applyUpdates: (updates) => {
          for (const { row, target } of updates) {
            records.set(target, row);
          }
          didApplyUpdate = true;
        },
        read: async (target) => {
          await Promise.resolve();
          if (didApplyUpdate && shouldFailNextCommittedRead) {
            didApplyUpdate = false;
            shouldFailNextCommittedRead = false;
            throw new Error('Canonical reload unavailable.');
          }
          const row = records.get(target);
          if (row === undefined) {
            throw new Error('Record unavailable.');
          }
          return row;
        },
      },
    );
    fixture.host.eventTarget.addEventListener('alteditor-lite:success', successListener);

    await fixture.editor.openBatchEditDialog(['record-a', 'record-b']);
    const batchField = document.querySelector<HTMLElement>(
      '[data-alteditor-lite-batch-field="name"]',
    );
    batchField
      ?.querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = batchField?.querySelector<HTMLInputElement>('input');
    if (input === null || input === undefined) {
      throw new Error('Expected a multi-record editor.');
    }
    input.value = 'Shared update';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector<HTMLFormElement>('.alteditor-lite-batch-form')
      ?.requestSubmit();

    await vi.waitFor(() => {
      expect(afterSuccess).toHaveBeenCalledOnce();
    });
    expect(successListener).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        committed: true,
        operation: 'batchEdit',
        phase: 'commit',
      }),
    );
    expect(fixture.editor.getState()).toMatchObject({
      action: 'batchEdit',
      status: 'open',
    });
    expect([...records.values()].map(({ name }) => name)).toEqual([
      'Shared update',
      'Shared update',
    ]);
  });

  it('uses asynchronous reads for multi-record opening and submission checks', async () => {
    const records = new Map<string, StandaloneRecord>([
      ['record-a', { id: 'record-a', name: 'Alpha' }],
      ['record-b', { id: 'record-b', name: 'Beta' }],
    ]);
    const reads: string[] = [];
    const updateMany = vi.fn(
      (
        changes: Readonly<Partial<{ readonly name: string }>>,
        originals: readonly StandaloneRecord[],
      ) =>
        originals.map((original) => ({
          ...original,
          name: changes.name ?? original.name,
        })),
    );
    const fixture = createStandaloneTestFixture(
      { operations: { updateMany } },
      {
        applyUpdates: (updates) => {
          for (const { row, target } of updates) {
            records.set(target, row);
          }
        },
        read: async (target) => {
          reads.push(target);
          await Promise.resolve();
          const row = records.get(target);
          if (row === undefined) {
            throw new Error('The requested record is unavailable.');
          }
          return row;
        },
      },
    );

    await fixture.editor.openBatchEditDialog(['record-a', 'record-b']);
    const batchField = document.querySelector<HTMLElement>(
      '[data-alteditor-lite-batch-field="name"]',
    );
    batchField
      ?.querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = batchField?.querySelector<HTMLInputElement>('input');
    if (input === null || input === undefined) {
      throw new Error('Expected a multi-record editor.');
    }
    input.value = 'Shared async name';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector<HTMLFormElement>('.alteditor-lite-batch-form')
      ?.requestSubmit();

    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(updateMany).toHaveBeenCalledOnce();
    expect([...records.values()].map(({ name }) => name)).toEqual([
      'Shared async name',
      'Shared async name',
    ]);
    expect(reads).toEqual([
      'record-a',
      'record-b',
      'record-a',
      'record-b',
      'record-a',
      'record-b',
      'record-a',
      'record-b',
      'record-a',
      'record-b',
    ]);
  });

  it('uses asynchronous reads for Remove opening and submission checks', async () => {
    const reads: string[] = [];
    const records = new Map<string, StandaloneRecord>([
      ['record-a', { id: 'record-a', name: 'Alpha' }],
    ]);
    const fixture = createStandaloneTestFixture(
      {},
      {
        applyRemove: (targets) => {
          for (const target of targets) {
            records.delete(target);
          }
        },
        read: async (target) => {
          reads.push(target);
          await Promise.resolve();
          const row = records.get(target);
          if (row === undefined) {
            throw new Error('The requested record is unavailable.');
          }
          return row;
        },
      },
    );

    await fixture.editor.openRemoveDialog(['record-a']);
    document
      .querySelector<HTMLButtonElement>('.alteditor-lite-dialog__button--destructive')
      ?.click();

    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(records.has('record-a')).toBe(false);
    expect(reads).toEqual(['record-a', 'record-a', 'record-a']);
  });

  it('reports a rejected read without mounting a partial dialog', async () => {
    const onError = vi.fn();
    const fixture = createStandaloneTestFixture(
      { hooks: { onError } },
      {
        read: async () => {
          await Promise.resolve();
          throw new Error('Record service unavailable.');
        },
      },
    );

    await expect(fixture.editor.openEditDialog('record-a')).rejects.toThrow();

    expect(fixture.editor.getState().status).toBe('ready');
    expect(
      document.querySelector<HTMLDialogElement>('.alteditor-lite-dialog')?.open,
    ).toBe(false);
    expect(document.querySelector('.alteditor-lite-form')).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'dialog', operation: 'edit' }),
    );
  });

  it('ignores a cancelled read after a later target opens', async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: ((row: StandaloneRecord) => void) | undefined;
    const fixture = createStandaloneTestFixture(
      {},
      {
        read: (target, context) => {
          if (target === 'record-a') {
            firstSignal = context?.signal;
            return new Promise<StandaloneRecord>((resolve) => {
              resolveFirst = resolve;
            });
          }
          return Promise.resolve({ id: 'record-b', name: 'Beta' });
        },
      },
    );
    const firstOpen = fixture.editor.openEditDialog('record-a');
    await vi.waitFor(() => {
      expect(firstSignal).toBeDefined();
    });

    await fixture.editor.closeDialog();
    await firstOpen;
    expect(firstSignal?.aborted).toBe(true);

    await fixture.editor.openEditDialog('record-b');
    resolveFirst?.({ id: 'record-a', name: 'Late Alpha' });
    await Promise.resolve();

    expect(
      document.querySelector<HTMLInputElement>('.alteditor-lite-form input')?.value,
    ).toBe('Beta');
    expect(fixture.editor.getState()).toMatchObject({
      action: 'edit',
      status: 'open',
    });
  });

  it('aborts a pending read when the editor is destroyed', async () => {
    let readSignal: AbortSignal | undefined;
    const fixture = createStandaloneTestFixture(
      {},
      {
        read: (_target, context) => {
          readSignal = context?.signal;
          return new Promise<StandaloneRecord>(() => undefined);
        },
      },
    );
    const openRequest = fixture.editor.openEditDialog('record-a');
    await vi.waitFor(() => {
      expect(readSignal).toBeDefined();
    });

    fixture.editor.destroy();
    await expect(openRequest).rejects.toBeInstanceOf(EditorDestroyedError);

    expect(readSignal?.aborted).toBe(true);
    expect(document.querySelector('.alteditor-lite-dialog')).toBeNull();
  });
});
