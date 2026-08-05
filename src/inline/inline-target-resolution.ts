import { EditorTargetUnavailableError } from '../core/alt-editor-lite-error.js';
import { isColumnVisiblyAvailable } from '../datatables/column-visibility.js';
import { resolveEditTarget } from '../datatables/row-target-resolution.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineTargetCapture } from './inline-target-capture.js';
import type { Api } from 'datatables.net';

function sameOptionalString(
  left: string | null | undefined,
  right: string | undefined,
): boolean {
  return (typeof left === 'string' && left.length > 0 ? left : undefined) === right;
}

/** Revalidates row, column, field mapping, and exact cell node identity. */
export function resolveInlineTarget<TRow extends object, TFormValues extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  capture: InlineTargetCapture<TRow, TFormValues>,
  mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
  unavailableMessage: string,
): number {
  const rowIndex = resolveEditTarget(
    table,
    tableElement,
    capture.rowCapture,
    unavailableMessage,
  );
  const currentMapping = mappings.get(capture.column.columnIndex);
  const column = table.column(capture.column.columnIndex);
  const dataSource = column.dataSrc();
  const currentCellNode = table.cell(rowIndex, capture.column.columnIndex).node();

  if (
    currentMapping?.fieldName !== capture.field.name ||
    !sameOptionalString(column.name(), capture.column.columnName) ||
    (typeof dataSource === 'string' ? dataSource : undefined) !==
      capture.column.dataSrc ||
    !isColumnVisiblyAvailable(column) ||
    !capture.cellNode.isConnected ||
    capture.cellNode.closest('table') !== tableElement ||
    currentCellNode !== capture.cellNode
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const cellIndex = table.cell(capture.cellNode).index();
  if (cellIndex.row !== rowIndex || cellIndex.column !== capture.column.columnIndex) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  return rowIndex;
}
