import { EditorFormController } from './form-controller.js';

import type { FormDependencies } from './form-dependency.js';
import type { LocalUniqueValidator } from './validate-editor-form.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';

/**
 * Builds an editor-owned form using the configured field layout.
 *
 * @param fields - Validated field configurations.
 * @param instanceId - Instance-scoped DOM prefix.
 * @param language - Complete resolved language.
 * @param validateUnique - Optional Host-scoped local uniqueness check.
 * @param template - Optional consumer-owned layout source.
 * @param dependencies - Optional declarative field state resolvers.
 * @param onDependencyError - Optional observer for current resolver failures.
 * @returns Owned DOM-backed FormController.
 */
export function buildEditorForm<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  instanceId: string,
  language: Readonly<AltEditorLiteLanguage>,
  validateUnique?: LocalUniqueValidator<TFormValues>,
  template?: DialogTemplateSource,
  dependencies?: Readonly<FormDependencies<TFormValues>>,
  onDependencyError?: (sourcePath: string, error: AltEditorLiteError) => void,
): EditorFormController<TFormValues> {
  return new EditorFormController(
    fields,
    instanceId,
    language,
    validateUnique,
    template,
    dependencies,
    onDependencyError,
  );
}
