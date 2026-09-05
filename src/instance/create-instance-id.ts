const INSTANCE_SEQUENCE_KEY = Symbol.for(
  'datatables-alteditor-lite.instance-sequence.v1',
);

type InstanceSequenceScope = typeof globalThis & Record<symbol, unknown>;

interface CryptoWithOptionalRandomUuid {
  readonly randomUUID?: () => string;
}

let fallbackSequence = 0;

function createFallbackInstanceId(): string {
  fallbackSequence += 1;
  const randomUuid = (globalThis.crypto as CryptoWithOptionalRandomUuid | undefined)
    ?.randomUUID;
  const randomId =
    typeof randomUuid === 'function' ? randomUuid.call(globalThis.crypto) : undefined;
  return randomId === undefined
    ? `alteditor-lite-${Date.now().toString(36)}-${String(fallbackSequence)}`
    : `alteditor-lite-${randomId}`;
}

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

  try {
    if (
      Reflect.set(runtimeScope, INSTANCE_SEQUENCE_KEY, nextSequence) &&
      runtimeScope[INSTANCE_SEQUENCE_KEY] === nextSequence
    ) {
      return `alteditor-lite-${String(nextSequence)}`;
    }
  } catch {
    // A restricted global scope cannot share the sequence property.
  }

  return createFallbackInstanceId();
}
