import { isColumnVisiblyAvailable } from '../../datatables/column-visibility.js';
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
  drawOwnership: DrawOwnership<TRow>,
  signal: AbortSignal,
  reason: 'dialog-edit-success' | 'inline-edit-success',
): Promise<Readonly<EditCommitResult<TRow>>> {
  await drawOwnership.runWithDraw(reason, signal, () => {
    table.row(rowIndex).data(row);
    table.draw(false);
  });
  return Object.freeze({ row, rowIndex });
}

/** Commits a row and captures a logical cell target from the completed draw. */
export async function commitRowUpdateWithFocus<TRow extends object>(
  table: Api<TRow>,
  rowIndex: number,
  row: TRow,
  columnIndex: number,
  columnName: string | undefined,
  drawOwnership: DrawOwnership<TRow>,
  signal: AbortSignal,
): Promise<
  Readonly<EditCommitResult<TRow>> & {
    readonly focusTarget: Readonly<LogicalCellTarget<TRow>>;
  }
> {
  const result = await commitRowUpdate(
    table,
    rowIndex,
    row,
    drawOwnership,
    signal,
    'inline-edit-success',
  );
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
  return Object.freeze({ ...result, focusTarget });
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
    !isColumnVisiblyAvailable(column)
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const cellNode = table.cell(resolvedRowIndex, target.columnIndex).node() as
    HTMLTableCellElement | null | undefined;
  if (cellNode?.isConnected !== true) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }
  return cellNode;
}
