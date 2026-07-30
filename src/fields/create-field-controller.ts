import { createCheckboxFieldController } from './checkbox-field-controller.js';
import { createFileFieldController } from './file-field-controller.js';
import {
  createInputFieldController,
  createNumberFieldController,
} from './input-field-controller.js';
import { createRadioFieldController } from './radio-field-controller.js';
import { createSelectFieldController } from './select-field-controller.js';
import { createTextareaFieldController } from './textarea-field-controller.js';

import type { FieldConfig } from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Creates the controller corresponding to a field discriminant.
 *
 * @param config - Validated field configuration.
 * @param fieldId - Instance-scoped DOM identifier.
 * @param language - Complete resolved language.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed controller for the configured field.
 */
export function createFieldController<TFormValues extends object>(
  config: FieldConfig<TFormValues>,
  fieldId: string,
  language: Readonly<AltEditorLiteLanguage>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  switch (config.type) {
    case 'hidden':
    case 'text':
    case 'email':
    case 'password':
    case 'date':
    case 'time':
    case 'datetime-local':
      return createInputFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'number':
      return createNumberFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'textarea':
      return createTextareaFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'checkbox':
      return createCheckboxFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'radio':
      return createRadioFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'select':
      return createSelectFieldController(
        config,
        fieldId,
        language.validation.invalid,
        onUserChange,
      );
    case 'file':
      return createFileFieldController(
        config,
        fieldId,
        language.validation.invalid,
        {
          fileCount: language.errors.fileCount,
          fileSize: language.errors.fileSize,
        },
        onUserChange,
      );
  }
}
