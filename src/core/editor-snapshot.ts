/**
 * Immutable identity captured for one Edit target before its dialog opens.
 */
export interface EditTargetSnapshot<TRow extends object> {
  /** Stable DataTables row index at capture time. */
  readonly rowIndex: number;
  /** Public DataTables row id when one is configured. */
  readonly rowId: string | undefined;
  /** Rendered row node at capture time, or null for an unrendered row. */
  readonly rowNode: HTMLTableRowElement | null;
  /** Shallow immutable copy supplied to update callbacks. */
  readonly original: Readonly<TRow>;
}

/**
 * Immutable identities captured for every Remove target before confirmation.
 */
export interface RemoveTargetSnapshot<TRow extends object> {
  /** Stable DataTables row indexes in capture order. */
  readonly rowIndexes: readonly number[];
  /** Public row ids aligned with `rowIndexes`. */
  readonly rowIds: readonly (string | undefined)[];
  /** Rendered row nodes aligned with `rowIndexes`. */
  readonly rowNodes: readonly (HTMLTableRowElement | null)[];
  /** Shallow immutable copies aligned with `rowIndexes`. */
  readonly originals: readonly Readonly<TRow>[];
}

/**
 * Creates the readonly shallow row view exposed by a snapshot.
 *
 * @param row - Live DataTables row object.
 * @returns A frozen shallow copy that cannot replace root properties.
 */
export function createReadonlyRowView<TRow extends object>(row: TRow): Readonly<TRow> {
  return Object.freeze({ ...row });
}

/**
 * Creates and freezes one Edit snapshot.
 *
 * @param rowIndex - DataTables row index.
 * @param rowId - Public row id, when available.
 * @param rowNode - Rendered row node, when available.
 * @param original - Live row data copied into the public snapshot.
 * @returns Frozen Edit snapshot.
 */
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
    original: createReadonlyRowView(original),
  });
}

/**
 * Creates and freezes an aligned Remove snapshot.
 *
 * @param rowIndexes - DataTables row indexes.
 * @param rowIds - Public row ids aligned by index.
 * @param rowNodes - Rendered row nodes aligned by index.
 * @param originals - Live row data copied into the public snapshot.
 * @returns Frozen Remove snapshot.
 * @throws TypeError when the snapshot arrays are not aligned.
 */
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
    throw new TypeError('Remove snapshot arrays must have the same length.');
  }

  return Object.freeze({
    rowIds: Object.freeze([...rowIds]),
    rowIndexes: Object.freeze([...rowIndexes]),
    rowNodes: Object.freeze([...rowNodes]),
    originals: Object.freeze(originals.map(createReadonlyRowView)),
  });
}

/**
 * Checks whether a captured row node is still rendered by the owned table.
 *
 * Connectedness is necessary for node-based resolution but does not replace
 * row-id or guarded row-index identity checks.
 *
 * @param rowNode - Captured row node.
 * @param tableElement - Table element owned by the editor.
 * @returns Whether the node remains connected to the owned table.
 */
export function isOwnedConnectedRowNode(
  rowNode: HTMLTableRowElement | null,
  tableElement: HTMLTableElement,
): rowNode is HTMLTableRowElement {
  return (
    rowNode !== null && rowNode.isConnected && rowNode.closest('table') === tableElement
  );
}
