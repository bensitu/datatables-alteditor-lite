import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';
import { normalizeNumberValue } from './number-value.js';

import type {
  DateFieldConfig,
  DateTimeFieldConfig,
  EmailFieldConfig,
  HiddenFieldConfig,
  NumberFieldConfig,
  PasswordFieldConfig,
  TextFieldConfig,
  TimeFieldConfig,
} from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { ManagedFieldController } from './managed-field-controller.js';

type StringInputConfig<TFormValues extends object> =
  | TextFieldConfig<TFormValues>
  | EmailFieldConfig<TFormValues>
  | PasswordFieldConfig<TFormValues>
  | DateFieldConfig<TFormValues>
  | TimeFieldConfig<TFormValues>
  | DateTimeFieldConfig<TFormValues>
  | HiddenFieldConfig<TFormValues>;

function isTrimEnabled<TFormValues extends object>(
  config: StringInputConfig<TFormValues>,
): boolean {
  return 'trim' in config && config.trim;
}

/**
 * Creates a string-valued native input controller.
 *
 * @param config - String input configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - English or overridden validation fallback.
 * @param requiredMessage - Localized required-value message.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createInputFieldController<TFormValues extends object>(
  config: StringInputConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  inputElement.type = config.type;

  const adapter: NativeControlAdapter<string> = {
    control: inputElement,
    readValue: () =>
      isTrimEnabled(config) ? inputElement.value.trim() : inputElement.value,
    writeValue: (value: unknown) => {
      if (typeof value !== 'string') {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a string value.`,
        );
      }

      inputElement.value = value;
    },
    setReadOnly: (isReadOnly: boolean) => {
      inputElement.readOnly = isReadOnly;
    },
    validateNative: () =>
      inputElement.checkValidity() ? { valid: true } : { valid: false },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    onUserChange,
    changeEvent: 'input',
  });
}

function createUndefinedNumberController<TFormValues extends object>(
  config: Extract<NumberFieldConfig<TFormValues>, { readonly emptyValue?: undefined }>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  inputElement.type = 'number';

  const readValue = (): number | undefined => {
    const normalizedValue = normalizeNumberValue(inputElement.value, undefined);
    if (!normalizedValue.valid) {
      return undefined;
    }

    return normalizedValue.value ?? undefined;
  };

  const adapter: NativeControlAdapter<number | undefined> = {
    control: inputElement,
    readValue,
    writeValue: (value: unknown) => {
      if (value === undefined) {
        inputElement.value = '';
        return;
      }

      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a number or its configured empty value.`,
        );
      }

      inputElement.value = String(value);
    },
    setReadOnly: (isReadOnly: boolean) => {
      inputElement.readOnly = isReadOnly;
    },
    validateNative: (): FieldValidationResult => {
      const normalizedValue = normalizeNumberValue(inputElement.value, undefined);
      if (!normalizedValue.valid || !inputElement.checkValidity()) {
        return {
          valid: false,
        };
      }

      return { valid: true };
    },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    onUserChange,
    changeEvent: 'input',
  });
}

function createNullNumberController<TFormValues extends object>(
  config: Extract<NumberFieldConfig<TFormValues>, { readonly emptyValue: null }>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  inputElement.type = 'number';

  const readValue = (): number | null => {
    const normalizedValue = normalizeNumberValue(inputElement.value, null);
    if (!normalizedValue.valid) {
      return null;
    }

    return normalizedValue.value ?? null;
  };

  const adapter: NativeControlAdapter<number | null> = {
    control: inputElement,
    readValue,
    writeValue: (value: unknown) => {
      if (value === null) {
        inputElement.value = '';
        return;
      }

      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a number or null.`,
        );
      }

      inputElement.value = String(value);
    },
    setReadOnly: (isReadOnly: boolean) => {
      inputElement.readOnly = isReadOnly;
    },
    validateNative: (): FieldValidationResult => {
      const normalizedValue = normalizeNumberValue(inputElement.value, null);
      if (!normalizedValue.valid || !inputElement.checkValidity()) {
        return {
          valid: false,
        };
      }

      return { valid: true };
    },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    onUserChange,
    changeEvent: 'input',
  });
}

/**
 * Creates a number controller with explicit empty-value normalization.
 *
 * @param config - Number field configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - English or overridden validation fallback.
 * @param requiredMessage - Localized required-value message.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createNumberFieldController<TFormValues extends object>(
  config: NumberFieldConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  if (config.emptyValue === null) {
    return createNullNumberController(
      config,
      fieldId,
      invalidMessage,
      requiredMessage,
      onUserChange,
    );
  }

  return createUndefinedNumberController(
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    onUserChange,
  );
}
