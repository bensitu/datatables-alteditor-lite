import type { Api } from 'datatables.net';

/** Resolves an exact, unique DataTables row id without constructing a selector. */
export function resolveUniqueRowIndexById<TRow extends object>(
  table: Api<TRow>,
  rowId: string,
): number | undefined {
  let match: number | undefined;
  for (const rowIndex of table.rows().indexes().toArray()) {
    if (table.row(rowIndex).id() !== rowId) {
      continue;
    }
    if (match !== undefined) {
      return undefined;
    }
    match = rowIndex;
  }
  return match;
}
