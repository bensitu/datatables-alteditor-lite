import { EditorTargetUnavailableError } from '../core/alt-editor-lite-error.js';

import {
  createEditTargetSnapshot,
  createRemoveTargetSnapshot,
  isOwnedConnectedRowNode,
  type EditTargetSnapshot,
  type RemoveTargetSnapshot,
} from './editor-snapshot.js';
import {
  createUniqueRowIndexById,
  resolveUniqueRowIndexById,
} from './row-id-resolution.js';

import type { Api } from 'datatables.net';

/**
 * Internal Edit capture retaining the live row reference used for identity.
 */
export interface EditTargetCapture<TRow extends object> {
  /** Public immutable snapshot. */
  readonly snapshot: EditTargetSnapshot<TRow>;
  /** Live object identity held by DataTables at capture time. */
  readonly sourceRow: TRow;
}

/**
 * Internal Remove capture retaining live row references used for identity.
 */
export interface RemoveTargetCapture<TRow extends object> {
  /** Public immutable snapshot. */
  readonly snapshot: RemoveTargetSnapshot<TRow>;
  /** Live object identities aligned with the public snapshot. */
  readonly sourceRows: readonly TRow[];
}

function resolveStableRowId<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  rowId: string | undefined,
  rowIndexById?: ReadonlyMap<string, number>,
): string | undefined {
  if (typeof rowId !== 'string' || rowId.length === 0) {
    return undefined;
  }

  const resolvedRowIndex =
    rowIndexById === undefined
      ? resolveUniqueRowIndexById(table, rowId)
      : rowIndexById.get(rowId);
  return resolvedRowIndex === rowIndex ? rowId : undefined;
}

function assertRowIndex(
  rowIndex: number | undefined,
  targetUnavailableMessage: string,
): number {
  if (typeof rowIndex !== 'number') {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  return rowIndex;
}

/**
 * Captures one row through its already validated DataTables index.
 *
 * @param table - Public DataTables API.
 * @param rowIndex - Exactly one resolved row index.
 * @param targetUnavailableMessage - Localized safe failure text.
 * @returns Immutable snapshot and internal source identity.
 */
export function captureEditTarget<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  targetUnavailableMessage: string,
): EditTargetCapture<TRow> {
  const rowApi = table.row(rowIndex);
  if (!rowApi.any()) {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  const resolvedIndex = assertRowIndex(rowApi.index(), targetUnavailableMessage);
  const sourceRow = rowApi.data();
  return {
    snapshot: createEditTargetSnapshot(
      resolvedIndex,
      resolveStableRowId(table, resolvedIndex, rowApi.id()),
      rowApi.node(),
      sourceRow,
    ),
    sourceRow,
  };
}

/** Captures one row when its optional public id was validated during enumeration. */
export function captureEditTargetWithValidatedRowId<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  rowId: string | undefined,
  targetUnavailableMessage: string,
): EditTargetCapture<TRow> {
  const rowApi = table.row(rowIndex);
  if (!rowApi.any()) {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  const resolvedIndex = assertRowIndex(rowApi.index(), targetUnavailableMessage);
  if (rowId !== undefined && rowApi.id() !== rowId) {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }
  const sourceRow = rowApi.data();
  return {
    snapshot: createEditTargetSnapshot(resolvedIndex, rowId, rowApi.node(), sourceRow),
    sourceRow,
  };
}

/**
 * Captures every row through validated DataTables indexes.
 *
 * @param table - Public DataTables API.
 * @param rowIndexes - One or more distinct resolved row indexes.
 * @param targetUnavailableMessage - Localized safe failure text.
 * @returns Immutable snapshot and aligned internal source identities.
 */
export function captureRemoveTargets<TRow extends object>(
  table: Api<TRow>,
  rowIndexes: readonly number[],
  targetUnavailableMessage: string,
): RemoveTargetCapture<TRow> {
  const resolvedIndexes: number[] = [];
  const rowIds: (string | undefined)[] = [];
  const rowNodes: (HTMLTableRowElement | null)[] = [];
  const sourceRows: TRow[] = [];
  const rowIndexById = createUniqueRowIndexById(table);

  for (const rowIndex of rowIndexes) {
    const rowApi = table.row(rowIndex);
    if (!rowApi.any()) {
      throw new EditorTargetUnavailableError(targetUnavailableMessage);
    }

    const resolvedIndex = assertRowIndex(rowApi.index(), targetUnavailableMessage);
    resolvedIndexes.push(resolvedIndex);
    rowIds.push(resolveStableRowId(table, resolvedIndex, rowApi.id(), rowIndexById));
    rowNodes.push(rowApi.node());
    sourceRows.push(rowApi.data());
  }

  return {
    snapshot: createRemoveTargetSnapshot(resolvedIndexes, rowIds, rowNodes, sourceRows),
    sourceRows: Object.freeze([...sourceRows]),
  };
}

function isSameRowIdentity<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  expectedRowId: string | undefined,
  sourceRow: TRow,
): boolean {
  const rowApi = table.row(rowIndex);
  if (!rowApi.any() || rowApi.index() !== rowIndex || rowApi.data() !== sourceRow) {
    return false;
  }

  return expectedRowId === undefined || rowApi.id() === expectedRowId;
}

function resolveSnapshotRowIndex<TRow extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  rowIndex: number,
  rowId: string | undefined,
  rowNode: HTMLTableRowElement | null,
  sourceRow: TRow,
  targetUnavailableMessage: string,
  rowIndexById?: ReadonlyMap<string, number>,
): number {
  if (rowId !== undefined) {
    const resolvedRowIndex =
      rowIndexById === undefined
        ? resolveUniqueRowIndexById(table, rowId)
        : rowIndexById.get(rowId);
    if (resolvedRowIndex === undefined) {
      throw new EditorTargetUnavailableError(targetUnavailableMessage);
    }
    const rowById = table.row(resolvedRowIndex);
    const resolvedIndex = rowById.index();
    if (
      rowById.any() &&
      typeof resolvedIndex === 'number' &&
      resolvedIndex === rowIndex &&
      isSameRowIdentity(table, resolvedIndex, rowId, sourceRow)
    ) {
      return resolvedIndex;
    }

    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  if (isOwnedConnectedRowNode(rowNode, tableElement)) {
    const rowByNode = table.row(rowNode);
    const resolvedIndex = rowByNode.index();
    if (
      rowByNode.any() &&
      typeof resolvedIndex === 'number' &&
      resolvedIndex === rowIndex &&
      isSameRowIdentity(table, resolvedIndex, undefined, sourceRow)
    ) {
      return resolvedIndex;
    }
  }

  if (isSameRowIdentity(table, rowIndex, undefined, sourceRow)) {
    return rowIndex;
  }

  throw new EditorTargetUnavailableError(targetUnavailableMessage);
}

/**
 * Resolves an Edit target without consulting current selection.
 *
 * Row id is authoritative. A connected owned node is the next choice, and the
 * captured index is accepted only when the exact live row object still
 * occupies that index.
 *
 * @param table - Public DataTables API.
 * @param tableElement - Table element owned by the editor.
 * @param capture - Snapshot and live source identity.
 * @param targetUnavailableMessage - Localized safe failure text.
 * @returns Current DataTables row index for the captured target.
 */
export function resolveEditTarget<TRow extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  capture: EditTargetCapture<TRow>,
  targetUnavailableMessage: string,
  rowIndexById?: ReadonlyMap<string, number>,
): number {
  return resolveSnapshotRowIndex(
    table,
    tableElement,
    capture.snapshot.rowIndex,
    capture.snapshot.rowId,
    capture.snapshot.rowNode,
    capture.sourceRow,
    targetUnavailableMessage,
    rowIndexById,
  );
}

/**
 * Resolves every Remove target atomically without consulting current selection.
 *
 * @param table - Public DataTables API.
 * @param tableElement - Table element owned by the editor.
 * @param capture - Aligned snapshots and live source identities.
 * @param targetUnavailableMessage - Localized safe failure text.
 * @returns Current distinct DataTables indexes for all captured rows.
 * @throws EditorTargetUnavailableError when any target is stale or duplicated.
 */
export function resolveRemoveTargets<TRow extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  capture: RemoveTargetCapture<TRow>,
  targetUnavailableMessage: string,
): readonly number[] {
  const targetCount = capture.snapshot.rowIndexes.length;
  if (
    capture.snapshot.rowIds.length !== targetCount ||
    capture.snapshot.rowNodes.length !== targetCount ||
    capture.snapshot.originals.length !== targetCount ||
    capture.sourceRows.length !== targetCount
  ) {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  const rowIndexById = capture.snapshot.rowIds.some((rowId) => rowId !== undefined)
    ? createUniqueRowIndexById(table)
    : undefined;

  const resolvedIndexes = capture.snapshot.rowIndexes.map((rowIndex, targetIndex) => {
    const sourceRow = capture.sourceRows[targetIndex];
    if (sourceRow === undefined) {
      throw new EditorTargetUnavailableError(targetUnavailableMessage);
    }

    return resolveSnapshotRowIndex(
      table,
      tableElement,
      rowIndex,
      capture.snapshot.rowIds[targetIndex],
      capture.snapshot.rowNodes[targetIndex] ?? null,
      sourceRow,
      targetUnavailableMessage,
      rowIndexById,
    );
  });

  if (new Set(resolvedIndexes).size !== resolvedIndexes.length) {
    throw new EditorTargetUnavailableError(targetUnavailableMessage);
  }

  return resolvedIndexes;
}
