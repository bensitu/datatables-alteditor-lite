import { EditorTargetUnavailableError } from '../core/alt-editor-lite-error.js';

import { isColumnVisiblyAvailable } from './column-visibility.js';
import { resolveUniqueRowIndexById } from './row-id-resolution.js';

import type { DataTablesHost } from './datatables-host.js';
import type { EditCommitResult } from '../core/editing/edit-transaction.js';
import type { OwnedOperationRequest } from '../core/editing/operation-owner.js';
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
  return resolveUniqueRowIndexById(table, rowId) === rowIndex ? rowId : undefined;
}

/** Replaces one canonical row through the DataTables host boundary. */
export async function commitRowUpdate<TRow extends object>(
  host: DataTablesHost<TRow>,
  rowIndex: number,
  row: TRow,
  request: OwnedOperationRequest,
): Promise<Readonly<EditCommitResult<TRow>>> {
  await host.applyInlineUpdate(rowIndex, row, {
    mode: request.mode,
    operation: 'edit',
    signal: request.abortController.signal,
  });
  return Object.freeze({ row });
}

/** Commits a row and captures a logical cell target from the completed draw. */
export async function commitRowUpdateWithFocus<TRow extends object>(
  host: DataTablesHost<TRow>,
  rowIndex: number,
  row: TRow,
  columnIndex: number,
  columnName: string | undefined,
  request: OwnedOperationRequest,
): Promise<
  Readonly<EditCommitResult<TRow>> & {
    readonly focusTarget: Readonly<LogicalCellTarget<TRow>>;
  }
> {
  const result = await commitRowUpdate(host, rowIndex, row, request);
  const table = host.unwrap();
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
  const rowIndexById =
    target.rowId === undefined
      ? undefined
      : resolveUniqueRowIndexById(table, target.rowId);
  if (target.rowId !== undefined && rowIndexById === undefined) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }
  const rowApi = table.row(rowIndexById ?? target.rowIndex);
  const resolvedRowIndex = rowApi.index();
  const column = table.column(target.columnIndex);
  if (
    !rowApi.any() ||
    typeof resolvedRowIndex !== 'number' ||
    (target.rowId === undefined && rowApi.data() !== target.row) ||
    (target.rowId !== undefined && rowApi.id() !== target.rowId) ||
    (target.columnName !== undefined && column.name() !== target.columnName) ||
    !isColumnVisiblyAvailable(column)
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const cellNode = table.cell(resolvedRowIndex, target.columnIndex).node() as
    HTMLTableCellElement | null | undefined;
  if (!(cellNode instanceof HTMLTableCellElement) || !cellNode.isConnected) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }
  return cellNode;
}
