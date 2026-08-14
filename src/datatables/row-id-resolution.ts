import type { Api } from 'datatables.net';

/** Resolves an exact, unique DataTables row id without constructing a selector. */
export function resolveUniqueRowIndexById<TRow extends object>(
  table: Api<TRow>,
  rowId: string,
): number | undefined {
  const rows = table.rows();
  const rowIndexes = rows.indexes().toArray();
  const rowIds = rows.ids().toArray();
  let match: number | undefined;
  for (let position = 0; position < rowIds.length; position += 1) {
    if (rowIds[position] !== rowId) {
      continue;
    }
    if (match !== undefined) {
      return undefined;
    }
    match = rowIndexes[position];
  }
  return match;
}
