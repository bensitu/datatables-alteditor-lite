import { EditorConfigurationError } from '../alt-editor-lite-error.js';
import {
  assertCompleteRow,
  type CanonicalRows,
  requireRowId,
} from '../complete-row-result.js';

/** Captures distinct IDs before persistence and matches every result to its original. */
export function createBatchRowValidator<TRow extends object>(
  originals: readonly Readonly<TRow>[],
  rows: CanonicalRows<TRow>,
): (rowCandidates: unknown) => readonly TRow[] {
  const readId = rows.identity(originals[0] as TRow);
  const positions = new Map(
    originals.map((row, index) => [requireRowId(readId(row)), index]),
  );
  if (positions.size !== originals.length) {
    throw new EditorConfigurationError('Batch Edit requires distinct original row IDs.');
  }
  return (rowCandidates) => {
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
    const ordered = new Array<TRow>(originals.length);
    for (const rowCandidate of rowCandidates) {
      assertCompleteRow(rowCandidate, 'operations.updateMany');
      const position = positions.get(requireRowId(readId(rowCandidate as TRow)));
      if (position === undefined || ordered[position] !== undefined) {
        throw new EditorConfigurationError(
          'operations.updateMany must return each original row ID exactly once.',
        );
      }
      ordered[position] = rows.check(
        rowCandidate,
        'operations.updateMany',
        originals[position],
      );
    }
    return Object.freeze(ordered);
  };
}
