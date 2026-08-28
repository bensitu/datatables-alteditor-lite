import {
  EditorSelectionCountError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { isColumnVisiblyAvailable } from '../datatables/column-visibility.js';
import {
  captureEditTarget,
  type EditTargetCapture,
} from '../datatables/row-target-resolution.js';
import { getPathValue } from '../object-path/get-path-value.js';

import { isInlineFieldEligible } from './inline-field-eligibility.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineTargetSummary } from './inline-edit-state.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

/** Exact row, column, field, and DOM identity owned by one inline session. */
export interface InlineTargetCapture<TRow extends object, TFormValues extends object> {
  readonly rowCapture: EditTargetCapture<TRow>;
  readonly column: Readonly<InlineColumnMapping<TFormValues>>;
  readonly field: Readonly<FieldConfig<TFormValues>>;
  readonly originalValue: unknown;
  readonly cellNode: HTMLTableCellElement;
  readonly summary: Readonly<InlineTargetSummary>;
}

/** Resolves unique public selectors and captures an eligible main-table cell. */
export function captureInlineTarget<TRow extends object, TFormValues extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  rowSelector: RowSelector<TRow>,
  columnSelector: ColumnSelector,
  fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
  mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
  unavailableMessage: string,
): InlineTargetCapture<TRow, TFormValues> {
  const rowIndexes = table.rows(rowSelector).indexes().toArray();
  if (rowIndexes.length !== 1) {
    throw new EditorSelectionCountError(
      'exactly-one',
      rowIndexes.length,
      unavailableMessage,
    );
  }
  const columnIndexes = table.columns(columnSelector).indexes().toArray();
  if (columnIndexes.length !== 1) {
    throw new EditorSelectionCountError(
      'exactly-one',
      columnIndexes.length,
      unavailableMessage,
    );
  }

  const rowIndex = rowIndexes[0];
  const columnIndex = columnIndexes[0];
  if (rowIndex === undefined || columnIndex === undefined) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const mapping = mappings.get(columnIndex);
  const field = mapping === undefined ? undefined : fieldsByName.get(mapping.fieldName);
  const column = table.column(columnIndex);
  const visibleIndex = column.index('visible');
  if (
    mapping === undefined ||
    field === undefined ||
    !isInlineFieldEligible(field) ||
    !isColumnVisiblyAvailable(column) ||
    typeof visibleIndex !== 'number'
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const cell = table.cell(rowIndex, columnIndex);
  const cellNode = cell.node();
  if (
    !(cellNode instanceof HTMLTableCellElement) ||
    !cellNode.isConnected ||
    cellNode.closest('table') !== tableElement ||
    cellNode.closest('tbody') === null
  ) {
    throw new EditorTargetUnavailableError(unavailableMessage);
  }

  const rowCapture = captureEditTarget(table, rowIndex, unavailableMessage);
  const key = rowCapture.snapshot.rowId ?? rowIndex;
  const summary = Object.freeze({
    columnIndex,
    fieldName: mapping.fieldName,
    fieldNames: Object.freeze([mapping.fieldName]),
    key,
    rowIndex,
    ...(rowCapture.snapshot.rowId === undefined
      ? {}
      : { rowId: rowCapture.snapshot.rowId }),
    ...(mapping.columnName === undefined ? {} : { columnName: mapping.columnName }),
  });

  return {
    cellNode,
    column: mapping,
    field,
    originalValue: getPathValue(rowCapture.sourceRow, mapping.fieldName),
    rowCapture,
    summary,
  };
}
