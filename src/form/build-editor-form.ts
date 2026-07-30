import { EditorFormController } from './form-controller.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { FieldConfig } from '../fields/field-config.js';

/**
 * Builds a Create form from stable field order.
 *
 * @param fields - Validated field configurations.
 * @param instanceId - Instance-scoped DOM prefix.
 * @param language - Complete resolved language.
 * @returns Owned DOM-backed FormController.
 */
export function buildEditorForm<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  instanceId: string,
  language: Readonly<AltEditorLiteLanguage>,
): EditorFormController<TFormValues> {
  return new EditorFormController(fields, instanceId, language);
}
