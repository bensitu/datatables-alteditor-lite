import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/datatables.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';
import { installDialogElementSupport } from './standalone-test-fixture.js';

interface Values {
  readonly name: string;
  readonly rank: number;
}

function createServerSideTable(tableId: string, rows: TestRow[]) {
  return createTestTable(tableId, {
    ajax: (
      request: object,
      callback: (response: {
        readonly data: readonly TestRow[];
        readonly draw: number;
        readonly recordsFiltered: number;
        readonly recordsTotal: number;
      }) => void,
    ) => {
      const parameters = request as {
        readonly draw?: number;
        readonly length?: number;
        readonly start?: number;
      };
      const start = parameters.start ?? 0;
      const length = parameters.length ?? 2;
      callback({
        data: rows.slice(start, start + length),
        draw: parameters.draw ?? 0,
        recordsFiltered: rows.length,
        recordsTotal: rows.length,
      });
    },
    data: undefined,
    serverSide: true,
  });
}

function replaceRow(rows: TestRow[], replacement: TestRow): void {
  const index = rows.findIndex(({ id }) => id === replacement.id);
  if (index < 0) {
    throw new Error('Expected a loaded server-side row.');
  }
  rows[index] = replacement;
}

function confirmRemove(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '.alteditor-lite-dialog__button--destructive',
  );
  if (button === null) {
    throw new Error('Expected an open Remove confirmation.');
  }
  button.click();
}

describe('DataTables server-side materialized rows', () => {
  let editor: AltEditorLite<TestRow, Values> | undefined;
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
    destroyTestTables();
  });

  it('edits a currently materialized row and retains server-owned refresh behavior', async () => {
    const rows: TestRow[] = [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
    ];
    const { api } = createServerSideTable('server-side-edit', rows);
    const update = vi.fn((values: Readonly<Partial<Values>>, original: TestRow) => {
      const replacement = { ...original, name: values.name ?? original.name };
      replaceRow(rows, replacement);
      return replacement;
    });
    const currentEditor = new AltEditorLite<TestRow, Values>(api, {
      fields: [
        { label: 'Name', name: 'name', type: 'text' },
        { label: 'Rank', name: 'rank', type: 'number' },
      ],
      operations: { update },
    });
    editor = currentEditor;

    await currentEditor.openEditDialog('#row-a');
    const input = document.querySelector<HTMLInputElement>(
      '[data-field-name="name"] input',
    );
    if (input === null) {
      throw new Error('Expected a materialized row editor.');
    }
    input.value = 'Updated Alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(currentEditor.getState().status).toBe('ready');
    });
    expect(update).toHaveBeenCalledOnce();
    expect(rows[0]?.name).toBe('Updated Alpha');
    expect(api.row('#row-a').data().name).toBe('Updated Alpha');

    await currentEditor.refresh();
    expect(api.rows().count()).toBe(2);
  });

  it('edits a currently materialized row inline with replacement mode', async () => {
    const rows: TestRow[] = [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
    ];
    const { api } = createServerSideTable('server-side-inline', rows);
    const update = vi.fn((values: Readonly<Partial<Values>>, original: TestRow) => {
      const replacement = { ...original, name: values.name ?? original.name };
      replaceRow(rows, replacement);
      return replacement;
    });
    const currentEditor = new AltEditorLite<TestRow, Values>(api, {
      editing: {
        inline: { enabled: true, updateMode: 'replace-row' },
      },
      fields: [
        { inlineEdit: true, label: 'Name', name: 'name', type: 'text' },
        { label: 'Rank', name: 'rank', type: 'number' },
      ],
      operations: { update },
    });
    editor = currentEditor;

    await currentEditor.openInlineEdit('#row-a', 0);
    const input = document.querySelector<HTMLInputElement>(
      '.alteditor-lite-inline input',
    );
    if (input === null) {
      throw new Error('Expected a materialized inline editor.');
    }
    input.value = 'Inline Alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await currentEditor.submitInlineEdit();

    expect(update).toHaveBeenCalledOnce();
    expect(rows[0]?.name).toBe('Inline Alpha');
    expect(api.row('#row-a').data().name).toBe('Inline Alpha');
  });

  it('updates currently materialized rows through one multi-record operation', async () => {
    const rows: TestRow[] = [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
    ];
    const { api } = createServerSideTable('server-side-batch', rows);
    const updateMany = vi.fn(
      (changes: Readonly<Partial<Values>>, originals: readonly TestRow[]) => {
        const replacements = originals.map((original) => ({
          ...original,
          name: changes.name ?? original.name,
        }));
        for (const replacement of replacements) {
          replaceRow(rows, replacement);
        }
        return replacements;
      },
    );
    const currentEditor = new AltEditorLite<TestRow, Values>(api, {
      fields: [
        { label: 'Name', name: 'name', type: 'text' },
        { label: 'Rank', name: 'rank', type: 'number' },
      ],
      operations: { updateMany },
    });
    editor = currentEditor;

    await currentEditor.openBatchEditDialog(['#row-a', '#row-b']);
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
      throw new Error('Expected a materialized multi-record editor.');
    }
    input.value = 'Shared server name';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector<HTMLFormElement>('.alteditor-lite-batch-form')
      ?.requestSubmit();

    await vi.waitFor(() => {
      expect(currentEditor.getState().status).toBe('ready');
    });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(rows.slice(0, 2).map(({ name }) => name)).toEqual([
      'Shared server name',
      'Shared server name',
    ]);
    expect(api.row('#row-a').data().name).toBe('Shared server name');
    expect(api.row('#row-b').data().name).toBe('Shared server name');
  });

  it('removes a currently materialized row and reloads the current page', async () => {
    const rows: TestRow[] = [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
    ];
    const { api } = createServerSideTable('server-side-remove', rows);
    const remove = vi.fn((removedRows: readonly TestRow[]) => {
      const removedIds = new Set(removedRows.map(({ id }) => id));
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (removedIds.has(rows[index]?.id ?? '')) {
          rows.splice(index, 1);
        }
      }
    });
    const currentEditor = new AltEditorLite<TestRow, Values>(api, {
      fields: [
        { label: 'Name', name: 'name', type: 'text' },
        { label: 'Rank', name: 'rank', type: 'number' },
      ],
      operations: { remove },
    });
    editor = currentEditor;

    await currentEditor.openRemoveDialog('#row-a');
    confirmRemove();

    await vi.waitFor(() => {
      expect(currentEditor.getState().status).toBe('ready');
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(rows.map(({ id }) => id)).toEqual(['row-b', 'row-c']);
    expect(api.row('#row-a').any()).toBe(false);
    expect(api.rows().count()).toBe(2);
  });

  it('rejects an editor whose materialized target was replaced by a server draw', async () => {
    const rows: TestRow[] = [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
    ];
    const { api } = createServerSideTable('server-side-stale', rows);
    const update = vi.fn((values: Readonly<Partial<Values>>, original: TestRow) => ({
      ...original,
      name: values.name ?? original.name,
    }));
    const currentEditor = new AltEditorLite<TestRow, Values>(api, {
      fields: [
        { label: 'Name', name: 'name', type: 'text' },
        { label: 'Rank', name: 'rank', type: 'number' },
      ],
      operations: { update },
    });
    editor = currentEditor;

    await currentEditor.openEditDialog('#row-a');
    rows[0] = { id: 'row-a', name: 'Server replacement', rank: 1 };
    api.draw(false);
    const input = document.querySelector<HTMLInputElement>(
      '[data-field-name="name"] input',
    );
    if (input === null) {
      throw new Error('Expected the open row editor.');
    }
    input.value = 'Stale client edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(currentEditor.getState().status).toBe('open');
      expect(currentEditor.getState()).toHaveProperty('submissionError');
    });
    expect(update).not.toHaveBeenCalled();
    expect(rows[0].name).toBe('Server replacement');
  });
});
