import { createCheckboxFieldController } from './checkbox-field-controller.js';
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

import type { FieldConfig } from './field-config.js';
import type { FieldControllerPresentation } from './field-controller-presentation.js';
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
  presentation: Readonly<FieldControllerPresentation> = DIALOG_FIELD_PRESENTATION,
): ManagedFieldController<TFormValues> {
  let controller: ManagedFieldController<TFormValues>;
  switch (config.type) {
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
  }

  if (presentation.label === 'visually-hidden') {
    for (const label of controller.element.querySelectorAll<HTMLElement>(
      '.dt-alteditor-lite-field__label, .dt-alteditor-lite-field__description',
    )) {
      label.classList.add('dt-alteditor-lite-visually-hidden');
    }
  }
  if (presentation.error === 'field') {
    return controller;
  }

  const errorElement = controller.element.querySelector<HTMLElement>(
    '.dt-alteditor-lite-field__error',
  );
  const errorId = errorElement?.id;
  errorElement?.remove();
  if (errorId !== undefined) {
    for (const control of controller.element.querySelectorAll<HTMLElement>(
      '[aria-describedby]',
    )) {
      const references = (control.getAttribute('aria-describedby') ?? '')
        .split(/\s+/u)
        .filter((reference) => reference.length > 0 && reference !== errorId);
      if (references.length === 0) {
        control.removeAttribute('aria-describedby');
      } else {
        control.setAttribute('aria-describedby', references.join(' '));
      }
    }
  }

  let externalError: string | undefined;
  return {
    ...controller,
    clearError: () => {
      externalError = undefined;
      controller.clearError();
    },
    getError: () => externalError,
    showError: (message: string) => {
      externalError = message;
      controller.showError(message);
    },
  };
}
