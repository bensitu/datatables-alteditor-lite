import { createReadonlyRowView } from '../core/readonly-row-view.js';

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
  const snapshots = replacements.map((replacement) => ({
    ...replacement,
    previousRow: createReadonlyRowView<TRow>(replacement.previousRow),
  }));
  try {
    for (const replacement of snapshots) {
      appliedReplacements.push(replacement);
      replacement.write(replacement.row);
    }
  } catch (error: unknown) {
    for (const replacement of [...appliedReplacements].reverse()) {
      try {
        replacement.write(replacement.previousRow);
      } catch {
        // Preserve the replacement failure while attempting every restoration.
      }
    }
    throw error;
  }
}
