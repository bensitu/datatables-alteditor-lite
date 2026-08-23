import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import { installDialogElementSupport } from './standalone-test-fixture.js';

import type { HostBatchUpdate } from '../../src/host/editor-host.js';

interface RecordRow {
  readonly id: string;
  readonly name: string;
}

interface RecordValues {
  readonly name: string;
}

describe('AltEditorLite Standalone batch edit', () => {
  let editor: AltEditorLite<RecordRow, RecordValues, string> | undefined;
  let restoreDialogElement: () => void;

  beforeAll(() => {
    restoreDialogElement = installDialogElementSupport();
  });

  afterAll(() => {
    restoreDialogElement();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.replaceChildren();
  });

  it('applies one common value to ordered explicit targets', async () => {
    const records = new Map<string, RecordRow>([
      ['record-a', { id: 'record-a', name: 'Alpha' }],
      ['record-b', { id: 'record-b', name: 'Beta' }],
    ]);
    const lifecycle: string[] = [];
    const applyUpdates = vi.fn(
      (updates: readonly Readonly<HostBatchUpdate<RecordRow, string>>[]) => {
        lifecycle.push('apply');
        for (const { row, target } of updates) {
          records.set(target, row);
        }
      },
    );
    const eventTarget = new EventTarget();
    for (const eventName of [
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]) {
      eventTarget.addEventListener(eventName, () => {
        lifecycle.push(eventName);
      });
    }
    const host = new StandaloneHost<RecordRow, string>({
      applyUpdates,
      eventTarget,
      read: (target) => {
        const row = records.get(target);
        if (row === undefined) {
          throw new Error('The requested record is unavailable.');
        }
        return row;
      },
    });
    editor = new AltEditorLite(host, {
      editing: { dialog: { enabled: true } },
      fields: [{ label: 'Name', name: 'name', type: 'text' }],
    });

    await editor.openBatchEditDialog(['record-a', 'record-b']);
    const batchField = document.querySelector<HTMLElement>(
      '[data-alteditor-lite-batch-field="name"]',
    );
    const setValueButton = batchField?.querySelector<HTMLButtonElement>(
      '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
    );
    const input = batchField?.querySelector<HTMLInputElement>('input');
    setValueButton?.click();
    if (input === null || input === undefined) {
      throw new Error('Expected a batch name input.');
    }
    input.value = 'Shared name';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector<HTMLFormElement>('.alteditor-lite-batch-form')
      ?.requestSubmit();

    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('ready');
    });
    expect([...records.values()].map(({ name }) => name)).toEqual([
      'Shared name',
      'Shared name',
    ]);
    expect(applyUpdates).toHaveBeenCalledOnce();
    expect(applyUpdates.mock.calls[0]?.[0].map(({ target }) => target)).toEqual([
      'record-a',
      'record-b',
    ]);
    expect(lifecycle).toEqual([
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'apply',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]);
  });
});
