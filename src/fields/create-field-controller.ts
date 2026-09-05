import { createCheckboxFieldController } from './checkbox-field-controller.js';
import { createCustomFieldController } from './custom-field-controller.js';
import { DIALOG_FIELD_PRESENTATION } from './field-controller-presentation.js';
import { createFileFieldController } from './file-field-controller.js';
import {
  createInputFieldController,
  createNumberFieldController,
} from './input-field-controller.js';
import { createRadioFieldController } from './radio-field-controller.js';
import { createSearchSelectFieldController } from './search-select-field-controller.js';
import { createSelectFieldController } from './select-field-controller.js';
import { createTextareaFieldController } from './textarea-field-controller.js';
import { throwUnsupportedFieldType } from './unsupported-field-type.js';

import type { FieldConfig } from './field-config.js';
import type { FieldControllerPresentation } from './field-controller-presentation.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

const NEVER_ABORTED_SIGNAL = new AbortController().signal;

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
  presentation: Readonly<FieldControllerPresentation> = DIALOG_FIELD_PRESENTATION,
  lifecycleSignal: AbortSignal = NEVER_ABORTED_SIGNAL,
): ManagedFieldController<TFormValues> {
  let controller: ManagedFieldController<TFormValues>;
  switch (config.type) {
    case 'custom':
      controller = createCustomFieldController(
        config,
        fieldId,
        language,
        onUserChange,
        presentation.kind,
        lifecycleSignal,
      );
      break;
    case 'hidden':
    case 'text':
    case 'email':
    case 'password':
    case 'date':
    case 'time':
    case 'datetime-local':
      controller = createInputFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'number':
      controller = createNumberFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'textarea':
      controller = createTextareaFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'checkbox':
      controller = createCheckboxFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'radio':
      controller = createRadioFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'select':
      controller = createSelectFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        onUserChange,
      );
      break;
    case 'search-select':
      controller = createSearchSelectFieldController(
        config,
        fieldId,
        language,
        onUserChange,
      );
      break;
    case 'file':
      controller = createFileFieldController(
        config,
        fieldId,
        language.validation.invalid,
        language.validation.required,
        {
          fileCount: language.errors.fileCount,
          fileSize: language.errors.fileSize,
        },
        onUserChange,
      );
      break;
    default:
      controller = throwUnsupportedFieldType(config);
  }

  if (presentation.label === 'visually-hidden') {
    for (const label of controller.element.querySelectorAll<HTMLElement>(
      '.alteditor-lite-field__label, .alteditor-lite-field__description',
    )) {
      label.classList.add('alteditor-lite-visually-hidden');
    }
  }
  if (presentation.error === 'field') {
    return controller;
  }

  const errorElement = controller.element.querySelector<HTMLElement>(
    '.alteditor-lite-field__error',
  );
  errorElement?.classList.add('alteditor-lite-visually-hidden');

  return {
    ...controller,
    getError: () =>
      errorElement?.hidden === false ? errorElement.textContent : undefined,
  };
}
