import { EditorConfigurationError } from '../alt-editor-lite-error.js';
import { assertCompleteRow } from '../complete-row-result.js';

/** Checks that batch persistence returned a complete canonical row for each target. */
export function validateBatchRows<TRow extends object>(
  rowCandidates: unknown,
  originals: readonly Readonly<TRow>[],
): readonly TRow[] {
  if (!Array.isArray(rowCandidates)) {
    throw new EditorConfigurationError(
      'operations.updateMany must return an array of complete row objects.',
    );
  }
  if (rowCandidates.length !== originals.length) {
    throw new EditorConfigurationError(
      'operations.updateMany must return one canonical row for each original row.',
    );
  }
  for (const rowCandidate of rowCandidates) {
    assertCompleteRow(rowCandidate, 'operations.updateMany');
  }
  return Object.freeze([...(rowCandidates as TRow[])]);
}
