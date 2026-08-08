import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import { applyAllowedFieldAttributes } from './field-attributes.js';
import { OptionTokenMap } from './option-token-map.js';

import type {
  FieldChangeContext,
  FieldValidationContext,
  RadioFieldConfig,
} from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { EditorValues } from '../core/editor-values.js';

/**
 * Creates an accessible radio group with typed option values.
 *
 * @param config - Typed radio configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createRadioFieldController<
  TFormValues extends object,
  TValue extends string | number,
>(
  config: RadioFieldConfig<TFormValues, TValue>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const fieldElement = document.createElement('div');
  const labelElement = document.createElement('div');
  const groupElement = document.createElement('div');
  const errorElement = document.createElement('div');
  const tokenMap = new OptionTokenMap(config.options);
  const inputElements: HTMLInputElement[] = [];
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const isReadOnly = config.readonly ?? false;
  let isDestroyed = false;

  fieldElement.className = 'dt-alteditor-lite-field';
  fieldElement.dataset['fieldName'] = config.name;
  fieldElement.hidden = config.visible === false;
  labelElement.className = 'dt-alteditor-lite-field__label';
  labelElement.id = `${fieldId}-label`;
  labelElement.textContent = config.label;
  groupElement.className = 'dt-alteditor-lite-radio';
  groupElement.setAttribute('role', 'radiogroup');
  groupElement.setAttribute('aria-labelledby', labelElement.id);
  groupElement.setAttribute(
    'aria-describedby',
    config.description === undefined ? errorId : `${descriptionId} ${errorId}`,
  );
  errorElement.className = 'dt-alteditor-lite-field__error';
  errorElement.id = errorId;
  errorElement.hidden = true;
  errorElement.setAttribute('aria-live', 'polite');

  if (config.className !== undefined) {
    for (const classToken of config.className.split(/\s+/u)) {
      if (classToken.length > 0) {
        fieldElement.classList.add(classToken);
      }
    }
  }

  const preventReadOnlyMutation = (event: Event): void => {
    if (isReadOnly) {
      event.preventDefault();
    }
  };

  for (const [optionIndex, [token, option]] of tokenMap.entries().entries()) {
    const optionLabel = document.createElement('label');
    const inputElement = document.createElement('input');
    const optionText = document.createElement('span');

    inputElement.id = `${fieldId}-option-${String(optionIndex)}`;
    inputElement.name = `${fieldId}-group`;
    inputElement.type = 'radio';
    inputElement.value = token;
    inputElement.disabled = (config.disabled ?? false) || (option.disabled ?? false);
    inputElement.required = (config.required ?? false) && optionIndex === 0;
    inputElement.setAttribute('aria-readonly', String(isReadOnly));
    applyAllowedFieldAttributes(inputElement, config.attributes);
    inputElement.addEventListener('click', preventReadOnlyMutation);
    inputElement.addEventListener('keydown', preventReadOnlyMutation);
    inputElement.addEventListener('change', onUserChange);

    optionLabel.className = 'dt-alteditor-lite-radio__option';
    optionLabel.htmlFor = inputElement.id;
    optionText.textContent = option.label;
    optionLabel.append(inputElement, optionText);
    groupElement.append(optionLabel);
    inputElements.push(inputElement);
  }

  fieldElement.append(labelElement, groupElement);

  if (config.description !== undefined) {
    const descriptionElement = document.createElement('div');
    descriptionElement.className = 'dt-alteditor-lite-field__description';
    descriptionElement.id = descriptionId;
    descriptionElement.textContent = config.description;
    fieldElement.append(descriptionElement);
  }

  fieldElement.append(errorElement);

  const readValue = (): TValue | undefined => {
    const checkedInput = inputElements.find((inputElement) => inputElement.checked);
    return checkedInput === undefined
      ? undefined
      : tokenMap.valueForToken(checkedInput.value);
  };

  return {
    name: config.name,
    element: fieldElement,
    getValue: readValue,
    setValue: (value: unknown) => {
      if (value === undefined) {
        for (const inputElement of inputElements) {
          inputElement.checked = false;
        }
        return;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a configured option value.`,
        );
      }

      const token = tokenMap.tokenForValue(value as TValue);
      if (token === undefined) {
        throw new EditorConfigurationError(
          `Field "${config.name}" received an unknown option value.`,
        );
      }

      for (const inputElement of inputElements) {
        inputElement.checked = inputElement.value === token;
      }
    },
    setDisabled: (isDisabled: boolean) => {
      for (const [optionIndex, inputElement] of inputElements.entries()) {
        inputElement.disabled =
          isDisabled || (config.options[optionIndex]?.disabled ?? false);
      }
    },
    isDisabled: () =>
      inputElements.length === 0 ||
      inputElements.every((inputElement) => inputElement.disabled),
    focus: () => {
      const focusTarget =
        inputElements.find((inputElement) => inputElement.checked) ??
        inputElements.find((inputElement) => !inputElement.disabled);
      focusTarget?.focus();
    },
    validateNative: () => {
      const isValid =
        config.required !== true ||
        inputElements.some((inputElement) => inputElement.checked);
      return isValid ? { valid: true } : { valid: false, message: requiredMessage };
    },
    validateCustom: async (
      values: Readonly<EditorValues<TFormValues>>,
      signal: AbortSignal,
    ) => {
      if (config.validate === undefined) {
        return { valid: true };
      }

      const validationContext: FieldValidationContext<TFormValues> = {
        signal,
        values,
      };
      return await Promise.resolve(config.validate(readValue(), validationContext));
    },
    runOnChange: async (
      values: Readonly<EditorValues<TFormValues>>,
      signal: AbortSignal,
    ) => {
      if (config.onChange === undefined) {
        return;
      }

      const changeContext: FieldChangeContext<TFormValues> = {
        signal,
        values,
      };
      await Promise.resolve(config.onChange(readValue(), changeContext));
    },
    clearError: () => {
      groupElement.removeAttribute('aria-invalid');
      errorElement.hidden = true;
      errorElement.textContent = '';
    },
    showError: (message: string) => {
      groupElement.setAttribute('aria-invalid', 'true');
      errorElement.textContent = message;
      errorElement.hidden = false;
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      for (const inputElement of inputElements) {
        inputElement.removeEventListener('click', preventReadOnlyMutation);
        inputElement.removeEventListener('keydown', preventReadOnlyMutation);
        inputElement.removeEventListener('change', onUserChange);
      }
      fieldElement.remove();
    },
  };
}
