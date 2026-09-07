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
