import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import { ChoiceOptionStore } from './choice-option-store.js';
import { applyAllowedFieldAttributes } from './field-attributes.js';

import type {
  FieldChangeContext,
  FieldValidationContext,
  RadioFieldConfig,
  SelectOption,
} from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { EditorValues } from '../core/editor-values.js';

/** Creates an accessible radio group with replaceable typed options. */
export function createRadioFieldController<
  TFormValues extends object,
  TValue extends string | number,
>(
  config: RadioFieldConfig<TFormValues, TValue>,
  fieldId: string,
  _invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const fieldElement = document.createElement('div');
  const labelElement = document.createElement('div');
  const groupElement = document.createElement('div');
  const errorElement = document.createElement('div');
  const optionStore = new ChoiceOptionStore(config.options);
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  let inputElements: HTMLInputElement[] = [];
  let isDisabled = config.disabled ?? false;
  let isReadOnly = config.readOnly ?? false;
  let isRequired = config.required ?? false;
  let isDestroyed = false;

  fieldElement.className = 'alteditor-lite-field';
  fieldElement.dataset['fieldName'] = config.name;
  labelElement.className = 'alteditor-lite-field__label';
  labelElement.id = `${fieldId}-label`;
  labelElement.textContent = config.label;
  groupElement.className = 'alteditor-lite-radio';
  groupElement.setAttribute('role', 'radiogroup');
  groupElement.setAttribute('aria-labelledby', labelElement.id);
  groupElement.setAttribute(
    'aria-describedby',
    config.description === undefined ? errorId : `${descriptionId} ${errorId}`,
  );
  errorElement.className = 'alteditor-lite-field__error';
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

  const removeOptionListeners = (): void => {
    for (const inputElement of inputElements) {
      inputElement.removeEventListener('click', preventReadOnlyMutation);
      inputElement.removeEventListener('keydown', preventReadOnlyMutation);
      inputElement.removeEventListener('change', onUserChange);
    }
  };

  const applyRuntimeState = (): void => {
    const requiredOptionIndex = optionStore
      .options()
      .findIndex((option) => option.disabled !== true);
    groupElement.setAttribute('aria-readonly', String(isReadOnly));
    groupElement.setAttribute('aria-required', String(isRequired));
    for (const [optionIndex, inputElement] of inputElements.entries()) {
      const option = optionStore.options()[optionIndex];
      inputElement.disabled = isDisabled || option?.disabled === true;
      inputElement.required = isRequired && optionIndex === requiredOptionIndex;
      inputElement.setAttribute('aria-readonly', String(isReadOnly));
      inputElement.setAttribute('aria-required', String(inputElement.required));
    }
  };

  const renderOptions = (): void => {
    removeOptionListeners();
    inputElements = [];
    const fragment = document.createDocumentFragment();
    for (const [optionIndex, [token, option]] of optionStore.entries().entries()) {
      const optionLabel = document.createElement('label');
      const inputElement = document.createElement('input');
      const optionText = document.createElement('span');

      inputElement.id = `${fieldId}-option-${String(optionIndex)}`;
      inputElement.name = `${fieldId}-group`;
      inputElement.type = 'radio';
      inputElement.value = token;
      applyAllowedFieldAttributes(inputElement, config.attributes);
      inputElement.addEventListener('click', preventReadOnlyMutation);
      inputElement.addEventListener('keydown', preventReadOnlyMutation);
      inputElement.addEventListener('change', onUserChange);

      optionLabel.className = 'alteditor-lite-radio__option';
      optionLabel.htmlFor = inputElement.id;
      optionText.textContent = option.label;
      optionLabel.append(inputElement, optionText);
      fragment.append(optionLabel);
      inputElements.push(inputElement);
    }
    groupElement.replaceChildren(fragment);
    applyRuntimeState();
  };

  fieldElement.append(labelElement, groupElement);
  if (config.description !== undefined) {
    const descriptionElement = document.createElement('div');
    descriptionElement.className = 'alteditor-lite-field__description';
    descriptionElement.id = descriptionId;
    descriptionElement.textContent = config.description;
    fieldElement.append(descriptionElement);
  }
  fieldElement.append(errorElement);
  renderOptions();

  const readValue = (): TValue | undefined => {
    const checkedInput = inputElements.find((inputElement) => inputElement.checked);
    return checkedInput === undefined
      ? undefined
      : optionStore.valueForToken(checkedInput.value);
  };

  const setValue = (value: unknown): void => {
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
    const token = optionStore.tokenForValue(value as TValue);
    if (token === undefined) {
      throw new EditorConfigurationError(
        `Field "${config.name}" received an unknown option value.`,
      );
    }
    for (const inputElement of inputElements) {
      inputElement.checked = inputElement.value === token;
    }
  };

  return {
    name: config.name,
    element: fieldElement,
    getOptions: () => optionStore.options(),
    getValue: readValue,
    setValue,
    setOptions: (options: readonly SelectOption[]) => {
      const selectedValue = readValue();
      optionStore.replace(options as readonly SelectOption<TValue>[]);
      renderOptions();
      if (
        selectedValue !== undefined &&
        optionStore.tokenForValue(selectedValue) !== undefined
      ) {
        setValue(selectedValue);
      }
    },
    setDisabled: (nextDisabled: boolean) => {
      isDisabled = nextDisabled;
      applyRuntimeState();
    },
    isDisabled: () => isDisabled,
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      applyRuntimeState();
    },
    isReadOnly: () => isReadOnly,
    setRequired: (nextRequired: boolean) => {
      isRequired = nextRequired;
      applyRuntimeState();
    },
    isRequired: () => isRequired,
    focus: () => {
      const focusTarget =
        inputElements.find((inputElement) => inputElement.checked) ??
        inputElements.find((inputElement) => !inputElement.disabled);
      focusTarget?.focus();
    },
    validateNative: () =>
      isRequired && !inputElements.some((inputElement) => inputElement.checked)
        ? { valid: false, message: requiredMessage }
        : { valid: true },
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
      const changeContext: FieldChangeContext<TFormValues> = { signal, values };
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
      removeOptionListeners();
      inputElements = [];
      fieldElement.remove();
    },
  };
}
