import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';

export { createReadonlyRowView } from '../core/readonly-row-view.js';

/** Immutable identity captured for one DataTables Edit target. */
export interface EditTargetSnapshot<TRow extends object> {
  readonly rowIndex: number;
  readonly rowId: string | undefined;
  readonly rowNode: HTMLTableRowElement | null;
  readonly original: Readonly<TRow>;
}

/** Immutable identities captured for DataTables Remove targets. */
export interface RemoveTargetSnapshot<TRow extends object> {
  readonly rowIndexes: readonly number[];
  readonly rowIds: readonly (string | undefined)[];
  readonly rowNodes: readonly (HTMLTableRowElement | null)[];
  readonly originals: readonly Readonly<TRow>[];
}

/** Creates and freezes one DataTables Edit snapshot. */
export function createEditTargetSnapshot<TRow extends object>(
  rowIndex: number,
  rowId: string | undefined,
  rowNode: HTMLTableRowElement | null,
  original: TRow,
): EditTargetSnapshot<TRow> {
  return Object.freeze({
    rowId,
    rowIndex,
    rowNode,
    original: createReadonlyRowView<TRow>(original),
  });
}

/** Creates and freezes aligned DataTables Remove snapshots. */
export function createRemoveTargetSnapshot<TRow extends object>(
  rowIndexes: readonly number[],
  rowIds: readonly (string | undefined)[],
  rowNodes: readonly (HTMLTableRowElement | null)[],
  originals: readonly TRow[],
): RemoveTargetSnapshot<TRow> {
  const targetCount = rowIndexes.length;
  if (
    rowIds.length !== targetCount ||
    rowNodes.length !== targetCount ||
    originals.length !== targetCount
  ) {
    throw new EditorConfigurationError(
      'Remove snapshot arrays must have the same length.',
    );
  }

  return Object.freeze({
    rowIds: Object.freeze([...rowIds]),
    rowIndexes: Object.freeze([...rowIndexes]),
    rowNodes: Object.freeze([...rowNodes]),
    originals: Object.freeze(
      originals.map((original) => createReadonlyRowView<TRow>(original)),
    ),
  });
}

/** Checks whether a captured row node still belongs to the owned table. */
export function isOwnedConnectedRowNode(
  rowNode: HTMLTableRowElement | null,
  tableElement: HTMLTableElement,
): rowNode is HTMLTableRowElement {
  return (
    rowNode !== null && rowNode.isConnected && rowNode.closest('table') === tableElement
  );
}
