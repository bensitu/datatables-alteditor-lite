import { isColumnVisiblyAvailable } from '../datatables/column-visibility.js';
import { resolveUniqueRowIndexById } from '../datatables/row-id-resolution.js';

import { isInlineFieldEligible } from './inline-field-capability.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineTargetSummary } from './inline-edit-state.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api, SelectorModifier } from 'datatables.net';

/** Stable-enough target captured before an inline submission redraw. */
export interface InlineNavigationIntent {
  readonly columnIndex: number;
  readonly direction: 'forward' | 'backward';
  readonly rowId?: string;
  readonly rowIndex: number;
}

/** Finds the next eligible cell on the current DataTables page. */
export function createInlineNavigationIntent<
  TRow extends object,
  TFormValues extends object,
>(
  table: Api<TRow>,
  mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
  fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
  currentTarget: Readonly<InlineTargetSummary>,
  direction: 'forward' | 'backward',
): Readonly<InlineNavigationIntent> | undefined {
  const modifier: SelectorModifier = { page: 'current' };
  const rowIndexes = table.rows(modifier).indexes().toArray();
  const columnIndexes = table
    .columns(':visible')
    .indexes()
    .toArray()
    .filter((columnIndex) => {
      const mapping = mappings.get(columnIndex);
      const field =
        mapping === undefined ? undefined : fieldsByName.get(mapping.fieldName);
      return (
        field !== undefined &&
        isInlineFieldEligible(field) &&
        isColumnVisiblyAvailable(table.column(columnIndex))
      );
    });
  const currentRowPosition = rowIndexes.indexOf(currentTarget.rowIndex);
  const currentColumnPosition = columnIndexes.indexOf(currentTarget.columnIndex);
  if (currentRowPosition < 0 || currentColumnPosition < 0) {
    return undefined;
  }

  let nextRowPosition = currentRowPosition;
  let nextColumnPosition =
    direction === 'forward' ? currentColumnPosition + 1 : currentColumnPosition - 1;
  if (nextColumnPosition >= columnIndexes.length) {
    nextRowPosition += 1;
    nextColumnPosition = 0;
  } else if (nextColumnPosition < 0) {
    nextRowPosition -= 1;
    nextColumnPosition = columnIndexes.length - 1;
  }

  const nextRowIndex = rowIndexes[nextRowPosition];
  const nextColumnIndex = columnIndexes[nextColumnPosition];
  if (nextRowIndex === undefined || nextColumnIndex === undefined) {
    return undefined;
  }

  const rowApi = table.row(nextRowIndex);
  const rowId = rowApi.id();
  const hasStableRowId =
    typeof rowId === 'string' &&
    rowId.length > 0 &&
    resolveUniqueRowIndexById(table, rowId) === nextRowIndex;
  return Object.freeze({
    columnIndex: nextColumnIndex,
    direction,
    ...(hasStableRowId ? { rowId } : {}),
    rowIndex: nextRowIndex,
  });
}
