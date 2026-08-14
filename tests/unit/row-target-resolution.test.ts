import { afterEach, describe, expect, it } from 'vitest';

import { EditorTargetUnavailableError } from '../../src/core/alt-editor-lite-error.js';
import {
  captureEditTarget,
  captureRemoveTargets,
  resolveEditTarget,
  resolveRemoveTargets,
  type RemoveTargetCapture,
} from '../../src/datatables/row-target-resolution.js';

import type { Api } from 'datatables.net';

interface TestRow {
  readonly id: string;
  readonly name: string;
}

interface MutableMockRow {
  data: TestRow;
  readonly index: number;
  readonly node: HTMLTableRowElement | null;
  nodeSelectable?: boolean;
  reportedIndex?: number | null;
  readonly rowId: string | undefined;
}

interface MockTable {
  readonly api: Api<TestRow>;
  readonly selectors: unknown[];
}

function createMockTable(rows: readonly MutableMockRow[]): MockTable {
  const selectors: unknown[] = [];
  const row = (selector: unknown) => {
    selectors.push(selector);
    const target =
      typeof selector === 'number'
        ? rows.find((candidate) => candidate.index === selector)
        : selector instanceof HTMLTableRowElement
          ? rows.find(
              (candidate) =>
                candidate.nodeSelectable !== false && candidate.node === selector,
            )
          : undefined;

    return {
      any: () => target !== undefined,
      data: () => target?.data,
      id: () => target?.rowId,
      index: () =>
        target?.reportedIndex === null
          ? undefined
          : (target?.reportedIndex ?? target?.index),
      node: () => target?.node ?? null,
    };
  };

  return {
    api: {
      row,
      rows: () => ({
        ids: () => ({
          toArray: () => rows.map((candidate) => candidate.rowId),
        }),
        indexes: () => ({
          toArray: () => rows.map((candidate) => candidate.index),
        }),
      }),
    } as unknown as Api<TestRow>,
    selectors,
  };
}

function createOwnedRowNode(tableElement: HTMLTableElement): HTMLTableRowElement {
  const tableBody = document.createElement('tbody');
  const rowNode = document.createElement('tr');
  tableBody.append(rowNode);
  tableElement.append(tableBody);
  document.body.append(tableElement);
  return rowNode;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('row target resolution', () => {
  it('rejects missing rows and invalid public indexes during capture', () => {
    const missingTable = createMockTable([]);
    expect(() => captureEditTarget(missingTable.api, 0, 'Target unavailable.')).toThrow(
      EditorTargetUnavailableError,
    );
    expect(() =>
      captureRemoveTargets(missingTable.api, [0], 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);

    const invalidIndexTable = createMockTable([
      {
        data: { id: 'row-a', name: 'Alpha' },
        index: 0,
        node: null,
        reportedIndex: null,
        rowId: undefined,
      },
    ]);
    expect(() =>
      captureEditTarget(invalidIndexTable.api, 0, 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);
  });

  it('retains a row id only when it is non-empty and unique', () => {
    const emptyIdRow: MutableMockRow = {
      data: { id: 'empty', name: 'Empty' },
      index: 0,
      node: null,
      rowId: '',
    };
    const uniqueIdRow: MutableMockRow = {
      data: { id: 'unique', name: 'Unique' },
      index: 1,
      node: null,
      rowId: 'unique-id',
    };
    const firstDuplicateRow: MutableMockRow = {
      data: { id: 'duplicate-a', name: 'Duplicate A' },
      index: 2,
      node: null,
      rowId: 'shared-id',
    };
    const secondDuplicateRow: MutableMockRow = {
      data: { id: 'duplicate-b', name: 'Duplicate B' },
      index: 3,
      node: null,
      rowId: 'shared-id',
    };
    const { api } = createMockTable([
      emptyIdRow,
      uniqueIdRow,
      firstDuplicateRow,
      secondDuplicateRow,
    ]);

    expect(captureEditTarget(api, 0, 'Target unavailable.').snapshot.rowId).toBe(
      undefined,
    );
    expect(captureEditTarget(api, 1, 'Target unavailable.').snapshot.rowId).toBe(
      'unique-id',
    );
    expect(captureEditTarget(api, 2, 'Target unavailable.').snapshot.rowId).toBe(
      undefined,
    );
  });

  it('uses the unique row-id scan before node or index fallbacks', () => {
    const tableElement = document.createElement('table');
    const rowNode = createOwnedRowNode(tableElement);
    const sourceRow = { id: 'row-a', name: 'Alpha' };
    const mockRow: MutableMockRow = {
      data: sourceRow,
      index: 4,
      node: rowNode,
      rowId: 'row-a',
    };
    const { api, selectors } = createMockTable([mockRow]);
    const capture = captureEditTarget(api, 4, 'Target unavailable.');
    selectors.length = 0;

    expect(resolveEditTarget(api, tableElement, capture, 'Target unavailable.')).toBe(4);
    expect(selectors).not.toContain('#row-a');
    expect(selectors).not.toContain(rowNode);
    expect(selectors.every((selector) => selector === 4)).toBe(true);
  });

  it('resolves a connected owned row node when no stable row id exists', () => {
    const tableElement = document.createElement('table');
    const rowNode = createOwnedRowNode(tableElement);
    const mockRow: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 2,
      node: rowNode,
      rowId: undefined,
    };
    const { api, selectors } = createMockTable([mockRow]);
    const capture = captureEditTarget(api, 2, 'Target unavailable.');
    selectors.length = 0;

    expect(resolveEditTarget(api, tableElement, capture, 'Target unavailable.')).toBe(2);
    expect(selectors[0]).toBe(rowNode);
  });

  it('skips a disconnected node and accepts only the guarded index fallback', () => {
    const tableElement = document.createElement('table');
    const rowNode = createOwnedRowNode(tableElement);
    const sourceRow = { id: 'row-a', name: 'Alpha' };
    const mockRow: MutableMockRow = {
      data: sourceRow,
      index: 2,
      node: rowNode,
      rowId: undefined,
    };
    const { api, selectors } = createMockTable([mockRow]);
    const capture = captureEditTarget(api, 2, 'Target unavailable.');
    rowNode.remove();
    selectors.length = 0;

    expect(resolveEditTarget(api, tableElement, capture, 'Target unavailable.')).toBe(2);
    expect(selectors).toEqual([2]);
  });

  it('rejects an index fallback after the live row object is replaced', () => {
    const tableElement = document.createElement('table');
    const rowNode = createOwnedRowNode(tableElement);
    const mockRow: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 2,
      node: rowNode,
      rowId: undefined,
    };
    const { api } = createMockTable([mockRow]);
    const capture = captureEditTarget(api, 2, 'Target unavailable.');
    rowNode.remove();
    mockRow.data = { id: 'row-a', name: 'Replacement' };

    expect(() =>
      resolveEditTarget(api, tableElement, capture, 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);
  });

  it.each([
    {
      mutate: (row: MutableMockRow) => {
        Object.defineProperty(row, 'rowId', { configurable: true, value: undefined });
      },
      name: 'missing row id',
    },
    {
      mutate: (row: MutableMockRow) => {
        row.reportedIndex = null;
      },
      name: 'missing row-id index',
    },
    {
      mutate: (row: MutableMockRow) => {
        row.reportedIndex = 9;
      },
      name: 'changed row-id index',
    },
    {
      mutate: (row: MutableMockRow) => {
        row.data = { id: 'row-a', name: 'Replacement' };
      },
      name: 'changed row-id object',
    },
  ])('rejects a row-id target with $name', ({ mutate }) => {
    const tableElement = document.createElement('table');
    const mockRow: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 2,
      node: null,
      rowId: 'row-a',
    };
    const { api } = createMockTable([mockRow]);
    const capture = captureEditTarget(api, 2, 'Target unavailable.');
    mutate(mockRow);

    expect(() =>
      resolveEditTarget(api, tableElement, capture, 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);
  });

  it.each([
    {
      mutate: (row: MutableMockRow) => {
        row.nodeSelectable = false;
      },
      rejects: false,
    },
    {
      mutate: (row: MutableMockRow) => {
        row.reportedIndex = null;
      },
      rejects: true,
    },
    {
      mutate: (row: MutableMockRow) => {
        row.reportedIndex = 9;
      },
      rejects: true,
    },
    {
      mutate: (row: MutableMockRow) => {
        row.data = { id: 'row-a', name: 'Replacement' };
      },
      rejects: true,
    },
  ])(
    'guards a connected node before falling back to the captured index',
    ({ mutate, rejects }) => {
      const tableElement = document.createElement('table');
      const rowNode = createOwnedRowNode(tableElement);
      const mockRow: MutableMockRow = {
        data: { id: 'row-a', name: 'Alpha' },
        index: 2,
        node: rowNode,
        rowId: undefined,
      };
      const { api } = createMockTable([mockRow]);
      const capture = captureEditTarget(api, 2, 'Target unavailable.');
      mutate(mockRow);

      if (rejects) {
        expect(() =>
          resolveEditTarget(api, tableElement, capture, 'Target unavailable.'),
        ).toThrow(EditorTargetUnavailableError);
      } else {
        expect(resolveEditTarget(api, tableElement, capture, 'Target unavailable.')).toBe(
          2,
        );
      }
    },
  );

  it('rejects all Remove targets when any captured identity becomes stale', () => {
    const tableElement = document.createElement('table');
    const firstRow: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 0,
      node: null,
      rowId: undefined,
    };
    const secondRow: MutableMockRow = {
      data: { id: 'row-b', name: 'Beta' },
      index: 1,
      node: null,
      rowId: undefined,
    };
    const { api } = createMockTable([firstRow, secondRow]);
    const capture = captureRemoveTargets(api, [0, 1], 'Target unavailable.');
    secondRow.data = { id: 'row-b', name: 'Replacement' };

    expect(() =>
      resolveRemoveTargets(api, tableElement, capture, 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);
  });

  it('resolves an aligned distinct Remove capture', () => {
    const tableElement = document.createElement('table');
    const rows: readonly MutableMockRow[] = [
      {
        data: { id: 'row-a', name: 'Alpha' },
        index: 0,
        node: null,
        rowId: undefined,
      },
      {
        data: { id: 'row-b', name: 'Beta' },
        index: 1,
        node: null,
        rowId: undefined,
      },
    ];
    const { api } = createMockTable(rows);
    const capture = captureRemoveTargets(api, [0, 1], 'Target unavailable.');

    expect(
      resolveRemoveTargets(api, tableElement, capture, 'Target unavailable.'),
    ).toEqual([0, 1]);
  });

  it('rejects every form of misaligned Remove capture', () => {
    const tableElement = document.createElement('table');
    const row: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 0,
      node: null,
      rowId: undefined,
    };
    const { api } = createMockTable([row]);
    const capture = captureRemoveTargets(api, [0], 'Target unavailable.');
    const malformedCaptures: readonly RemoveTargetCapture<TestRow>[] = [
      { ...capture, snapshot: { ...capture.snapshot, rowIds: [] } },
      { ...capture, snapshot: { ...capture.snapshot, rowNodes: [] } },
      { ...capture, snapshot: { ...capture.snapshot, originals: [] } },
      { ...capture, sourceRows: [] },
    ];

    for (const malformedCapture of malformedCaptures) {
      expect(() =>
        resolveRemoveTargets(api, tableElement, malformedCapture, 'Target unavailable.'),
      ).toThrow(EditorTargetUnavailableError);
    }
  });

  it('rejects an absent source identity and duplicate resolved indexes', () => {
    const tableElement = document.createElement('table');
    const row: MutableMockRow = {
      data: { id: 'row-a', name: 'Alpha' },
      index: 0,
      node: null,
      rowId: undefined,
    };
    const { api } = createMockTable([row]);
    const capture = captureRemoveTargets(api, [0], 'Target unavailable.');
    const missingSourceCapture = {
      ...capture,
      sourceRows: [undefined],
    } as unknown as RemoveTargetCapture<TestRow>;

    expect(() =>
      resolveRemoveTargets(
        api,
        tableElement,
        missingSourceCapture,
        'Target unavailable.',
      ),
    ).toThrow(EditorTargetUnavailableError);

    const duplicateCapture = captureRemoveTargets(api, [0, 0], 'Target unavailable.');
    expect(() =>
      resolveRemoveTargets(api, tableElement, duplicateCapture, 'Target unavailable.'),
    ).toThrow(EditorTargetUnavailableError);
  });
});
