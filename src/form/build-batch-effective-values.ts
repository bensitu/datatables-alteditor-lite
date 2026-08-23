import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { getPathValue } from '../object-path/get-path-value.js';
import { setPathValue } from '../object-path/set-path-value.js';

import type { BatchChanges, EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FieldPath } from '../object-path/field-path.js';

/** Builds one form-shaped value object from declared paths and common changes. */
export function buildBatchEffectiveValues<TFormValues extends object>(
  original: Readonly<object>,
  changes: Readonly<BatchChanges<TFormValues>>,
  changedFields: readonly FieldPath<TFormValues>[],
  fields: readonly Readonly<FieldConfig<TFormValues>>[],
): Readonly<EditorValues<TFormValues>> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.editable === false || field.disabled === true) {
      continue;
    }
    setPathValue(values, field.name, getPathValue(original, field.name));
  }
  for (const fieldName of changedFields) {
    setPathValue(values, fieldName, getPathValue(changes, fieldName));
  }
  return freezeEditorValues(values as EditorValues<TFormValues>);
}
