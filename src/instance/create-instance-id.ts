const INSTANCE_SEQUENCE_KEY = Symbol.for(
  'datatables-alteditor-lite.instance-sequence.v1',
);

type InstanceSequenceScope = typeof globalThis & Record<symbol, unknown>;

/**
 * Creates a document-safe prefix used by editor-owned DOM identifiers.
 *
 * The symbol-backed sequence is shared by ESM and browser-global bundles in
 * the same JavaScript realm.
 *
 * @returns A realm-wide unique instance prefix.
 */
export function createInstanceId(): string {
  const runtimeScope = globalThis as InstanceSequenceScope;
  const currentSequence = runtimeScope[INSTANCE_SEQUENCE_KEY];
  const nextSequence =
    typeof currentSequence === 'number' &&
    Number.isSafeInteger(currentSequence) &&
    currentSequence >= 0
      ? currentSequence + 1
      : 1;

  Object.defineProperty(runtimeScope, INSTANCE_SEQUENCE_KEY, {
    configurable: true,
    enumerable: false,
    value: nextSequence,
    writable: true,
  });
  return `alteditor-lite-${String(nextSequence)}`;
}
