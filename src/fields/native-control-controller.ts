import { applyAllowedFieldAttributes } from './field-attributes.js';
import { createFieldControllerShell } from './field-controller-shell.js';

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
export interface NativeControlControllerArguments<TFormValues extends object, TValue> {
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

/**
 * Creates lifecycle, error, callback, and DOM behavior around a native control.
 *
 * @param controllerArguments - Typed construction arguments.
 * @returns An internal type-erased controller.
 */
export function createNativeControlController<TFormValues extends object, TValue>(
  controllerArguments: NativeControlControllerArguments<TFormValues, TValue>,
): ManagedFieldController<TFormValues> {
  const { adapter, config, fieldId } = controllerArguments;
  const { control } = adapter;
  const shell = createFieldControllerShell({
    config,
    control,
    fieldId,
    ...(controllerArguments.controlContainer === undefined
      ? {}
      : { controlContainer: controllerArguments.controlContainer }),
    ...(controllerArguments.labelPlacement === undefined
      ? {}
      : { labelPlacement: controllerArguments.labelPlacement }),
  });
  const fieldElement = shell.element;
  control.required = config.required ?? false;
  control.setAttribute('aria-required', String(control.required));
  control.disabled = config.disabled ?? false;
  let isReadOnly = config.readOnly ?? false;
  adapter.setReadOnly(isReadOnly);
  applyAllowedFieldAttributes(control, config.attributes);

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
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      adapter.setReadOnly(nextReadOnly);
    },
    isReadOnly: () => isReadOnly,
    setRequired: (isRequired: boolean) => {
      control.required = isRequired;
      control.setAttribute('aria-required', String(isRequired));
    },
    isRequired: () => control.required,
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
              : control.validationMessage.length > 0
                ? control.validationMessage
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
      shell.clearError();
    },
    showError: (message) => {
      shell.showError(message);
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
