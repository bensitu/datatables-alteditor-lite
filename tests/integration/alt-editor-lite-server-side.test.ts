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
      const index = rows.findIndex(({ id }) => id === original.id);
      rows[index] = replacement;
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
