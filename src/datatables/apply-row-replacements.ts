/** One synchronous row replacement with its restoration value. */
export interface RowReplacement<TRow extends object> {
  readonly previousRow: TRow;
  readonly row: TRow;
  readonly write: (row: TRow) => void;
}

/** Applies row replacements and restores earlier writes when a later write fails. */
export function applyRowReplacements<TRow extends object>(
  replacements: readonly Readonly<RowReplacement<TRow>>[],
): void {
  const appliedReplacements: Readonly<RowReplacement<TRow>>[] = [];
  try {
    for (const replacement of replacements) {
      replacement.write(replacement.row);
      appliedReplacements.push(replacement);
    }
  } catch (error: unknown) {
    while (appliedReplacements.length > 0) {
      const replacement = appliedReplacements.pop();
      if (replacement === undefined) {
        break;
      }
      try {
        replacement.write(replacement.previousRow);
      } catch {
        // Preserve the replacement failure while attempting every restoration.
      }
    }
    throw error;
  }
}
