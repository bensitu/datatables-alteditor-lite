import { isPlainRecord } from './readonly-row-view.js';

import type { EditorValues } from './editor-values.js';

function freezeValue(value: unknown, visited: WeakSet<object>): void {
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const nestedValue of Array.isArray(value) ? value : Object.values(value)) {
    freezeValue(nestedValue, visited);
  }
  Object.freeze(value);
}

/** Recursively freezes plain collected values while leaving host objects intact. */
export function freezeEditorValues<TFormValues extends object>(
  values: Readonly<EditorValues<TFormValues>>,
): Readonly<EditorValues<TFormValues>> {
  freezeValue(values, new WeakSet<object>());
  return values;
}
