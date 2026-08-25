import type { Api } from 'datatables.net';

/** Builds an index containing only non-duplicated DataTables row ids. */
export function createUniqueRowIndexById<TRow extends object>(
  table: Api<TRow>,
): ReadonlyMap<string, number> {
  const rows = table.rows();
  const rowIndexes = rows.indexes().toArray();
  const rowIds = rows.ids().toArray();
  const rowIndexById = new Map<string, number>();
  const duplicateRowIds = new Set<string>();

  for (let position = 0; position < rowIds.length; position += 1) {
    const rowId: unknown = rowIds[position];
    const rowIndex = rowIndexes[position];
    if (typeof rowId !== 'string' || rowIndex === undefined) {
      continue;
    }
    if (duplicateRowIds.has(rowId)) {
      continue;
    }
    if (rowIndexById.has(rowId)) {
      rowIndexById.delete(rowId);
      duplicateRowIds.add(rowId);
      continue;
    }
    rowIndexById.set(rowId, rowIndex);
  }

  return rowIndexById;
}

/** Resolves an exact, unique DataTables row id without constructing a selector. */
export function resolveUniqueRowIndexById<TRow extends object>(
  table: Api<TRow>,
  rowId: string,
): number | undefined {
  return createUniqueRowIndexById(table).get(rowId);
}
