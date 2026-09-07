import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EditorOperationBusyError } from '../../src/core/alt-editor-lite-error.js';

import {
  createStandaloneTestFixture,
  destroyStandaloneTestFixtures,
  installDialogElementSupport,
} from './standalone-test-fixture.js';

function submit(): void {
  document
    .querySelector('form')
    ?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

describe('dialog lifecycle coordination', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installDialogElementSupport();
  });
  afterEach(() => {
    destroyStandaloneTestFixtures();
  });
  afterAll(() => {
    restore();
  });

  it.each(['create', 'edit', 'batchEdit', 'remove'] as const)(
    'suppresses late %s results after destruction',
    async (operation) => {
      let finish!: () => void;
      let signal: AbortSignal | undefined;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const wait = async (context: { readonly signal: AbortSignal }) => {
        signal = context.signal;
        await pending;
      };
      const onError = vi.fn();
      const afterSuccess = vi.fn();
      const { editor, eventTarget, records } = createStandaloneTestFixture(
        {
          hooks: { onError, afterSuccess },
          operations: {
            create: async (values, context) => {
              await wait(context);
              return { id: 'created', name: values.name ?? '' };
            },
            update: async (values, row, context) => {
              await wait(context);
              return { ...row, ...values };
            },
            updateMany: async (values, rows, context) => {
              await wait(context);
              return rows.map((row) => ({ ...row, ...values }));
            },
            remove: async (_rows, context) => {
              await wait(context);
            },
          },
        },
        { applyUpdates: vi.fn() },
      );
      records.set('record-b', { id: 'record-b', name: 'Beta' });
      const events = vi.fn();
      for (const name of ['success', 'error', 'close'])
        eventTarget.addEventListener(`alteditor-lite:${name}`, events);
      if (operation === 'create') await editor.openCreateDialog({ name: 'Saved' });
      else if (operation === 'edit') await editor.openEditDialog('record-a');
      else if (operation === 'batchEdit')
        await editor.openBatchEditDialog(['record-a', 'record-b']);
      else await editor.openRemoveDialog(['record-a']);
      if (operation === 'remove')
        document
          .querySelector<HTMLButtonElement>('.alteditor-lite-dialog__button--submit')
          ?.click();
      else {
        editor.getField('name')?.setValue('Saved');
        submit();
      }
      await vi.waitFor(() => {
        expect(signal).toBeDefined();
      });
      await expect(editor.closeDialog()).rejects.toBeInstanceOf(EditorOperationBusyError);
      expect(signal?.aborted).toBe(false);
      editor.destroy();
      editor.destroy();
      expect(signal?.aborted).toBe(true);
      finish();
      await pending;
      await Promise.resolve();
      expect(events).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(afterSuccess).not.toHaveBeenCalled();
      expect(records.get('record-a')?.name).toBe('Alpha');
      expect(document.querySelector('dialog')).toBeNull();
      expect(() => editor.getState()).toThrow('destroyed');
    },
  );

  it('closes a successful batch edit by default', async () => {
    const { editor, records } = createStandaloneTestFixture(
      {},
      {
        applyUpdates: (updates) => {
          for (const { target, row } of updates) records.set(target, row);
        },
      },
    );
    records.set('record-b', { id: 'record-b', name: 'Beta' });
    await editor.openBatchEditDialog(['record-a', 'record-b']);
    editor.getField('name')?.setValue('Shared');
    submit();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect([...records.values()].map((row) => row.name)).toEqual(['Shared', 'Shared']);
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('does not restore a retained form destroyed after persistence', async () => {
    let prepare!: () => void;
    let isCommitted = false;
    const pending = new Promise<void>((resolve) => {
      prepare = resolve;
    });
    const onError = vi.fn();
    const afterSuccess = vi.fn();
    const { editor, eventTarget, records } = createStandaloneTestFixture(
      {
        editing: { dialog: { closeOnSuccess: false, enabled: true } },
        dependencies: {
          name: async () => {
            if (isCommitted) await pending;
            return {};
          },
        },
        hooks: { onError, afterSuccess },
        operations: { create: () => ({ id: 'saved', name: 'Saved' }) },
      },
      {
        applyCreate: (row) => {
          records.set(row.id, row);
          isCommitted = true;
          return row.id;
        },
      },
    );
    const success = vi.fn();
    const closed = vi.fn();
    eventTarget.addEventListener('alteditor-lite:success', success);
    eventTarget.addEventListener('alteditor-lite:close', closed);
    await editor.openCreateDialog({ name: 'Saved' });
    submit();
    await vi.waitFor(() => {
      expect(success).toHaveBeenCalledOnce();
    });
    editor.destroy();
    prepare();
    await pending;
    await Promise.resolve();
    expect(records.get('saved')?.name).toBe('Saved');
    expect(closed).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(afterSuccess).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it.each(['create', 'edit'] as const)(
    'rejects close during %s persistence and completes normally',
    async (operation) => {
      let complete!: (row: { id: string; name: string }) => void;
      const persist = vi.fn(
        () =>
          new Promise<{ id: string; name: string }>((resolve) => {
            complete = resolve;
          }),
      );
      const { editor, eventTarget, records } = createStandaloneTestFixture({
        operations: { create: persist, update: persist },
      });
      const events: string[] = [];
      eventTarget.addEventListener('alteditor-lite:success', () => {
        events.push('success');
      });
      eventTarget.addEventListener('alteditor-lite:close', () => {
        events.push('close');
      });
      if (operation === 'create') await editor.openCreateDialog({ name: 'Saved' });
      else {
        await editor.openEditDialog('record-a');
        editor.getField('name')?.setValue('Saved');
      }
      submit();
      await vi.waitFor(() => {
        expect(persist).toHaveBeenCalledOnce();
      });
      await expect(editor.closeDialog()).rejects.toBeInstanceOf(EditorOperationBusyError);
      expect(editor.getState().status).toBe('submitting');
      complete({ id: 'record-a', name: 'Saved' });
      await vi.waitFor(() => {
        expect(editor.getState().status).toBe('ready');
      });
      expect(records.get('record-a')?.name).toBe('Saved');
      expect(events).toEqual(['success', 'close']);
      expect(editor.getState().status).toBe('ready');
      expect(document.querySelector('dialog')?.open).toBe(false);
    },
  );

  it('rejects a pending close decision superseded by submission', async () => {
    let decide!: (allowed: boolean) => void;
    const beforeClose = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          decide = resolve;
        }),
    );
    const create = vi.fn(() => ({ id: 'created', name: 'Saved' }));
    const { editor } = createStandaloneTestFixture({
      hooks: { beforeClose },
      operations: { create },
    });
    await editor.openCreateDialog({ name: 'Saved' });
    const closing = editor.closeDialog();
    const rejected = expect(closing).rejects.toBeInstanceOf(EditorOperationBusyError);
    await vi.waitFor(() => {
      expect(beforeClose).toHaveBeenCalledOnce();
    });
    submit();
    await rejected;
    decide(true);
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it('cancels opening while initial dependencies are pending', async () => {
    let signal: AbortSignal | undefined;
    const { editor } = createStandaloneTestFixture({
      dependencies: {
        name: (_value, context) => {
          signal = context.signal;
          return new Promise(() => undefined);
        },
      },
    });
    const opening = editor.openEditDialog('record-a');
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('opening');
    });
    await editor.closeDialog();
    await opening;
    expect(signal?.aborted).toBe(true);
    expect(editor.getState().status).toBe('ready');
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('clears obsolete submission feedback after a field change', async () => {
    const { editor } = createStandaloneTestFixture({
      operations: {
        create: () => {
          throw new Error('Save failed.');
        },
      },
    });
    await editor.openCreateDialog({ name: 'Initial' });
    submit();
    await vi.waitFor(() => {
      expect(editor.getState()).toHaveProperty('submissionError');
    });
    editor.getField('name')?.setValue('Updated');
    expect(editor.getState()).toEqual({ action: 'create', status: 'open' });
    expect(document.querySelector('.alteditor-lite-dialog__errors')?.textContent).toBe(
      '',
    );
    expect(
      document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toBe('');
  });

  it('settles an opening hook cancellation without waiting for the consumer', async () => {
    let finish!: (result: boolean) => void;
    const beforeOpen = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const { editor, eventTarget } = createStandaloneTestFixture({
      hooks: { beforeOpen },
    });
    const opened = vi.fn();
    eventTarget.addEventListener('alteditor-lite:open', opened);
    const opening = editor.openEditDialog('record-a');
    await vi.waitFor(() => {
      expect(beforeOpen).toHaveBeenCalledOnce();
    });
    await editor.closeDialog();
    await opening;
    finish(true);
    await Promise.resolve();
    expect(opened).not.toHaveBeenCalled();
    expect(editor.getState().status).toBe('ready');
  });
});
