/** Creates a frozen shallow record view for public operation contexts. */
export function createReadonlyRowView<TRow extends object>(
  row: Readonly<TRow>,
): Readonly<TRow> {
  return Object.freeze({ ...row });
}
