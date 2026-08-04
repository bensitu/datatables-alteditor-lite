import { EditorTargetUnavailableError } from '../alt-editor-lite-error.js';

import type { DrawOwnership } from './draw-ownership.js';
import type { EditCommitResult } from './edit-transaction.js';
import type { Api } from 'datatables.net';

/** Logical post-commit cell identity resolved only after a draw. */
export interface LogicalCellTarget<TRow extends object> {
  readonly rowIndex: number;
  readonly rowId?: string;
  readonly row: TRow;
  readonly columnIndex: number;
  readonly columnName?: string;
}

function resolveStableRowId<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
): string | undefined {
  const rowId = table.row(rowIndex).id();
  if (typeof rowId !== 'string' || rowId.length === 0) {
    return undefined;
  }
  const rowById = table.row(`#${rowId}`);
  return rowById.any() && rowById.index() === rowIndex ? rowId : undefined;
}

/** Replaces one canonical row and waits for the corresponding public draw. */
export async function commitRowUpdate<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  row: TRow,
  columnIndex: number,
  columnName: string | undefined,
  drawOwnership: DrawOwnership<TRow>,
  signal: AbortSignal,
  reason: 'dialog-edit-success' | 'inline-edit-success',
): Promise<
  Readonly<EditCommitResult<TRow>> & {
    readonly focusTarget: Readonly<LogicalCellTarget<TRow>>;
  }
> {
  const rowApi = table.row(rowIndex);
  rowApi.data(row);
  const rowId = resolveStableRowId(table, rowIndex);
  const targetBase = {
    columnIndex,
    row,
    rowIndex,
    ...(columnName === undefined ? {} : { columnName }),
  };
  const focusTarget: Readonly<LogicalCellTarget<TRow>> = Object.freeze(
    rowId === undefined ? targetBase : { ...targetBase, rowId },
  );
  await drawOwnership.runWithDraw(reason, signal, () => {
    table.draw(false);
  });
  return Object.freeze({ focusTarget, row, rowIndex });
}

/** Resolves a post-draw logical target through public row and column APIs. */
export function resolveLogicalCellTarget<TRow extends object>(
  table: Api<TRow>,
  target: Readonly<LogicalCellTarget<TRow>>,
  unavailableMessage: string,
): HTMLTableCellElement {
  const rowApi =
    target.rowId === undefined
      ? table.row(target.rowIndex)
      : table.row(`#${target.rowId}`);
  const resolvedRowIndex = rowApi.index();
  const column = table.column(target.columnIndex);
  if (
    !rowApi.any() ||
    typeof resolvedRowIndex !== 'number' ||
    rowApi.data() !== target.row ||
    (target.rowId !== undefined && rowApi.id() !== target.rowId) ||
    (target.columnName !== undefined && column.name() !== target.columnName) ||
    !column.visible()
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const cellNode = table.cell(resolvedRowIndex, target.columnIndex).node();
  if (!cellNode.isConnected) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }
  return cellNode;
}
