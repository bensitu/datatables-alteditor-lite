import { createReadonlyRowView } from './readonly-row-view.js';

import type { EditorValues } from './editor-values.js';

/** Detaches and freezes plain collected values while leaving host objects intact. */
export function freezeEditorValues<TFormValues extends object>(
  values: Readonly<EditorValues<TFormValues>>,
): Readonly<EditorValues<TFormValues>> {
  return createReadonlyRowView(values);
}
