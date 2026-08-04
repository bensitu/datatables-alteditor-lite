import type { EditorValues } from './editor-values.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function freezeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeValue(item);
    }
    Object.freeze(value);
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const nestedValue of Object.values(value)) {
    freezeValue(nestedValue);
  }
  Object.freeze(value);
}

/** Recursively freezes plain collected values while leaving host objects intact. */
export function freezeEditorValues<TFormValues extends object>(
  values: Readonly<EditorValues<TFormValues>>,
): Readonly<EditorValues<TFormValues>> {
  freezeValue(values);
  return values;
}
