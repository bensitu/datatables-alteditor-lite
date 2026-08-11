import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

/** Rejects a field discriminant that is not part of the supported union. */
export function throwUnsupportedFieldType(config: never): never {
  const candidate: unknown = config;
  const fieldType =
    typeof candidate === 'object' && candidate !== null && 'type' in candidate
      ? String(Reflect.get(candidate, 'type'))
      : 'unknown';
  throw new EditorConfigurationError(`Unsupported field type "${fieldType}".`);
}
