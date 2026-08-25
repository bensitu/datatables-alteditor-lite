import { describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import {
  createEditTargetSnapshot,
  createReadonlyRowView,
  createRemoveTargetSnapshot,
  isOwnedConnectedRowNode,
} from '../../src/datatables/editor-snapshot.js';

interface SnapshotRow {
  readonly id: string;
  readonly nested: {
    readonly value: string;
  };
}

describe('editor snapshots', () => {
  it('creates a recursively frozen Edit snapshot without retaining plain data', () => {
    const row: SnapshotRow = {
      id: 'row-a',
      nested: { value: 'original' },
    };
    const rowNode = document.createElement('tr');
    const snapshot = createEditTargetSnapshot(3, 'row-a', rowNode, row);

    expect(snapshot).toEqual({
      original: row,
      rowId: 'row-a',
      rowIndex: 3,
      rowNode,
    });
    expect(snapshot.original).not.toBe(row);
    expect(snapshot.original.nested).not.toBe(row.nested);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.original)).toBe(true);
    expect(Object.isFrozen(snapshot.original.nested)).toBe(true);
  });

  it('creates aligned frozen Remove snapshots', () => {
    const firstRow: SnapshotRow = {
      id: 'row-a',
      nested: { value: 'first' },
    };
    const secondRow: SnapshotRow = {
      id: 'row-b',
      nested: { value: 'second' },
    };
    const snapshot = createRemoveTargetSnapshot(
      [1, 4],
      ['row-a', undefined],
      [null, document.createElement('tr')],
      [firstRow, secondRow],
    );

    expect(snapshot.rowIndexes).toEqual([1, 4]);
    expect(snapshot.rowIds).toEqual(['row-a', undefined]);
    expect(snapshot.originals).toEqual([firstRow, secondRow]);
    expect(snapshot.originals[0]).not.toBe(firstRow);
    expect(Object.isFrozen(snapshot.rowIndexes)).toBe(true);
    expect(Object.isFrozen(snapshot.originals)).toBe(true);
  });

  it.each([
    {
      originals: [{ id: 'row-a', nested: { value: 'first' } }],
      rowIds: [],
      rowIndexes: [1],
      rowNodes: [null],
    },
    {
      originals: [{ id: 'row-a', nested: { value: 'first' } }],
      rowIds: ['row-a'],
      rowIndexes: [1],
      rowNodes: [],
    },
    {
      originals: [],
      rowIds: ['row-a'],
      rowIndexes: [1],
      rowNodes: [null],
    },
  ])('rejects unaligned Remove snapshot arrays', (snapshotParts) => {
    expect(() =>
      createRemoveTargetSnapshot(
        snapshotParts.rowIndexes,
        snapshotParts.rowIds,
        snapshotParts.rowNodes,
        snapshotParts.originals,
      ),
    ).toThrow(EditorConfigurationError);
  });

  it('creates readonly row views independently', () => {
    const row = { id: 'row-a', nested: { value: 'value' } };
    const readonlyRow = createReadonlyRowView(row);

    expect(readonlyRow).toEqual(row);
    expect(readonlyRow).not.toBe(row);
    expect(Object.isFrozen(readonlyRow)).toBe(true);
  });

  it('accepts only connected row nodes owned by the table', () => {
    const ownedTable = document.createElement('table');
    const otherTable = document.createElement('table');
    const ownedBody = ownedTable.createTBody();
    const otherBody = otherTable.createTBody();
    const ownedRow = ownedBody.insertRow();
    const otherRow = otherBody.insertRow();
    const detachedRow = document.createElement('tr');
    document.body.append(ownedTable, otherTable);

    expect(isOwnedConnectedRowNode(null, ownedTable)).toBe(false);
    expect(isOwnedConnectedRowNode(detachedRow, ownedTable)).toBe(false);
    expect(isOwnedConnectedRowNode(otherRow, ownedTable)).toBe(false);
    expect(isOwnedConnectedRowNode(ownedRow, ownedTable)).toBe(true);
  });
});
