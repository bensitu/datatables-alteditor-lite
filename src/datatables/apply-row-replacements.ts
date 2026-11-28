import { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import { createMutableRowCopy } from '../core/readonly-row-view.js';

/** One synchronous row replacement with its restoration value. */
export interface RowReplacement<TRow extends object> {
  readonly previousRow: TRow;
  readonly row: TRow;
  readonly write: (row: TRow) => void;
}

/** Applies row replacements and restores earlier writes when a later write fails. */
export function applyRowReplacements<TRow extends object>(
  replacements: readonly Readonly<RowReplacement<TRow>>[],
  onRollbackFailure?: (error: AltEditorLiteError) => void,
): void {
  const appliedReplacements: Readonly<RowReplacement<TRow>>[] = [];
  const snapshots = replacements.map((replacement) => ({
    ...replacement,
    previousRow: createMutableRowCopy<TRow>(replacement.previousRow),
  }));
  try {
    for (const replacement of snapshots) {
      appliedReplacements.push(replacement);
      replacement.write(replacement.row);
    }
  } catch (error: unknown) {
    const causes = [error];
    for (const replacement of [...appliedReplacements].reverse()) {
      try {
        replacement.write(replacement.previousRow);
      } catch (restoreError: unknown) {
        causes.push(restoreError);
      }
    }
    if (causes.length > 1) {
      const failure = new AltEditorLiteError({
        code: 'ROW_ROLLBACK_FAILED',
        message:
          'Some records could not be restored. Reload the data before another batch update.',
        cause: new AggregateError(causes),
      });
      onRollbackFailure?.(failure);
      throw failure;
    }
    throw error;
  }
}
