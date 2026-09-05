import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
  type NativeControlControllerArguments,
} from './native-control-controller.js';
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

  const readValue = (): string =>
    isTrimEnabled(config) ? inputElement.value.trim() : inputElement.value;

  const adapter: NativeControlAdapter<string> = {
    control: inputElement,
    readValue,
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
    validateNative: () => {
      if (isTrimEnabled(config)) {
        inputElement.value = readValue();
      }
      return inputElement.checkValidity() ? { valid: true } : { valid: false };
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

function createNumberController<
  TFormValues extends object,
  TEmpty extends null | undefined,
>(
  config: NativeControlControllerArguments<TFormValues, number | TEmpty>['config'],
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
  emptyValue: TEmpty,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  inputElement.type = 'number';

  const readValue = (): number | TEmpty => {
    const normalizedValue = normalizeNumberValue(inputElement.value, emptyValue);
    if (!normalizedValue.valid) {
      return emptyValue;
    }

    return normalizedValue.value ?? emptyValue;
  };

  const adapter: NativeControlAdapter<number | TEmpty> = {
    control: inputElement,
    readValue,
    writeValue: (value: unknown) => {
      if (value === emptyValue) {
        inputElement.value = '';
        return;
      }

      if (typeof value !== 'number' || !Number.isFinite(value)) {
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
      const normalizedValue = normalizeNumberValue(inputElement.value, emptyValue);
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

/** Creates a number controller with explicit empty-value normalization. */
export function createNumberFieldController<TFormValues extends object>(
  config: NumberFieldConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  return config.emptyValue === null
    ? createNumberController(
        config,
        fieldId,
        invalidMessage,
        requiredMessage,
        onUserChange,
        null,
      )
    : createNumberController(
        config,
        fieldId,
        invalidMessage,
        requiredMessage,
        onUserChange,
        undefined,
      );
}
