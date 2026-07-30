let nextInstanceSequence = 0;

/**
 * Creates a document-safe prefix used by editor-owned DOM identifiers.
 *
 * @returns A process-local unique instance prefix.
 */
export function createInstanceId(): string {
  nextInstanceSequence += 1;
  return `dt-alteditor-lite-${String(nextInstanceSequence)}`;
}
