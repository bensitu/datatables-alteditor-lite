import { EditorFormController } from './form-controller.js';

import type { LocalUniqueValidator } from './validate-editor-form.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';

/**
 * Builds an editor-owned form using the configured field layout.
 *
 * @param fields - Validated field configurations.
 * @param instanceId - Instance-scoped DOM prefix.
 * @param language - Complete resolved language.
 * @param validateUnique - Optional table-scoped local uniqueness check.
 * @param template - Optional consumer-owned layout source.
 * @returns Owned DOM-backed FormController.
 */
export function buildEditorForm<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  instanceId: string,
  language: Readonly<AltEditorLiteLanguage>,
  validateUnique?: LocalUniqueValidator<TFormValues>,
  template?: DialogTemplateSource,
): EditorFormController<TFormValues> {
  return new EditorFormController(fields, instanceId, language, validateUnique, template);
}
