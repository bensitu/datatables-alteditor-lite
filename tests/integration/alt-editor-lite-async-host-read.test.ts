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
