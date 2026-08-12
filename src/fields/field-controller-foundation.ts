import { applyAllowedFieldAttributes } from './field-attributes.js';

import type {
  BaseFieldConfig,
  FieldChangeContext,
  FieldValidationContext,
} from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { EditorValues } from '../core/editor-values.js';

type NativeControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Adapter used to normalize one native control.
 */
export interface NativeControlAdapter<TValue> {
  readonly control: NativeControl;
  readValue(signal?: AbortSignal): TValue | PromiseLike<TValue>;
  writeValue(value: unknown): void;
  setReadOnly(isReadOnly: boolean): void;
  validateNative(): FieldValidationResult;
  destroy?(): void;
}

/**
 * Arguments shared by native control controller construction.
 */
export interface NativeControllerArguments<TFormValues extends object, TValue> {
  readonly config: BaseFieldConfig<TFormValues, TValue> & {
    readonly label?: string;
    readonly description?: string;
    readonly readOnly?: boolean;
    readonly required?: boolean;
  };
  readonly fieldId: string;
  readonly adapter: NativeControlAdapter<TValue>;
  readonly invalidMessage: string;
  readonly requiredMessage: string;
  readonly onUserChange: () => void;
  readonly changeEvent?: 'change' | 'input';
  readonly controlContainer?: HTMLElement;
  readonly labelPlacement?: 'before-control' | 'after-control';
}

function addConsumerClasses(element: HTMLElement, className: string): void {
  for (const classToken of className.split(/\s+/u)) {
    if (classToken.length > 0) {
      element.classList.add(classToken);
    }
  }
}

/**
 * Creates lifecycle, error, callback, and DOM behavior around a native control.
 *
 * @param controllerArguments - Typed construction arguments.
 * @returns An internal type-erased controller.
 */
export function createNativeControlController<TFormValues extends object, TValue>(
  controllerArguments: NativeControllerArguments<TFormValues, TValue>,
): ManagedFieldController<TFormValues> {
  const { adapter, config, fieldId } = controllerArguments;
  const { control } = adapter;
  const fieldElement = document.createElement('div');
  const errorElement = document.createElement('div');
  const errorId = `${fieldId}-error`;

  fieldElement.className = 'dt-alteditor-lite-field';
  fieldElement.dataset['fieldName'] = config.name;
  errorElement.className = 'dt-alteditor-lite-field__error';
  errorElement.id = errorId;
  errorElement.hidden = true;
  errorElement.setAttribute('aria-live', 'polite');

  control.id = fieldId;
  control.classList.add('dt-alteditor-lite-field__control');
  control.setAttribute('aria-describedby', errorId);
  control.required = config.required ?? false;
  control.disabled = config.disabled ?? false;
  adapter.setReadOnly(config.readOnly ?? false);
  applyAllowedFieldAttributes(control, config.attributes);

  const controlContainer = controllerArguments.controlContainer ?? control;
  if (
    config.label !== undefined &&
    controllerArguments.labelPlacement === 'after-control'
  ) {
    const labelElement = document.createElement('label');
    const labelTextElement = document.createElement('span');
    labelElement.className = 'dt-alteditor-lite-checkbox';
    labelElement.htmlFor = fieldId;
    labelTextElement.className = 'dt-alteditor-lite-field__label';
    labelTextElement.textContent = config.label;
    labelElement.append(control, labelTextElement);
    fieldElement.append(labelElement);
  } else if (config.label !== undefined) {
    const labelElement = document.createElement('label');
    labelElement.className = 'dt-alteditor-lite-field__label';
    labelElement.htmlFor = fieldId;
    labelElement.textContent = config.label;
    fieldElement.append(labelElement);
    fieldElement.append(controlContainer);
  } else {
    fieldElement.append(controlContainer);
  }

  if (config.description !== undefined) {
    const descriptionElement = document.createElement('div');
    const descriptionId = `${fieldId}-description`;
    descriptionElement.className = 'dt-alteditor-lite-field__description';
    descriptionElement.id = descriptionId;
    descriptionElement.textContent = config.description;
    control.setAttribute('aria-describedby', `${descriptionId} ${errorId}`);
    fieldElement.append(descriptionElement);
  }

  fieldElement.append(errorElement);

  if (config.visible === false) {
    fieldElement.hidden = true;
  }

  if (config.className !== undefined) {
    addConsumerClasses(fieldElement, config.className);
  }

  const changeEvent = controllerArguments.changeEvent ?? 'change';
  control.addEventListener(changeEvent, controllerArguments.onUserChange);
  let isDestroyed = false;

  return {
    name: config.name,
    element: fieldElement,
    getValue: (signal?: AbortSignal) => adapter.readValue(signal),
    setValue: (value: unknown) => {
      adapter.writeValue(value);
    },
    setDisabled: (isDisabled: boolean) => {
      control.disabled = isDisabled;
    },
    isDisabled: () => control.disabled,
    focus: () => {
      control.focus();
    },
    validateNative: () => {
      const validationResult = adapter.validateNative();
      if (validationResult.valid) {
        return validationResult;
      }

      return {
        valid: false,
        message:
          validationResult.message ??
          (control.validity.badInput
            ? controllerArguments.invalidMessage
            : control.validity.valueMissing
              ? controllerArguments.requiredMessage
              : controllerArguments.invalidMessage),
      };
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
      return await Promise.resolve(
        config.validate(
          await Promise.resolve(adapter.readValue(signal)),
          validationContext,
        ),
      );
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
      await Promise.resolve(
        config.onChange(await Promise.resolve(adapter.readValue(signal)), changeContext),
      );
    },
    clearError: () => {
      control.removeAttribute('aria-invalid');
      errorElement.hidden = true;
      errorElement.textContent = '';
    },
    showError: (message: string) => {
      control.setAttribute('aria-invalid', 'true');
      errorElement.textContent = message;
      errorElement.hidden = false;
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      control.removeEventListener(changeEvent, controllerArguments.onUserChange);
      adapter.destroy?.();
      fieldElement.remove();
    },
  };
}
