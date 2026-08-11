import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { getPathValue } from '../object-path/get-path-value.js';
import { setPathValue } from '../object-path/set-path-value.js';

import type { EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FieldPath } from '../object-path/field-path.js';

/** Builds complete declared values from canonical row data and one candidate. */
export function buildInlineValues<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  originalRow: Readonly<object>,
  fieldName: FieldPath<TFormValues>,
  candidate: unknown,
): Readonly<EditorValues<TFormValues>> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.disabled === true || field.editable === false) {
      continue;
    }
    setPathValue(values, field.name, getPathValue(originalRow, field.name));
  }
  setPathValue(values, fieldName, candidate);
  return freezeEditorValues(values as EditorValues<TFormValues>);
}
