import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';

import { createFieldControllerShell } from './field-controller-shell.js';

import type {
  CustomFieldAdapter,
  CustomFieldConfig,
  CustomFieldControllerContext,
} from './custom-field.js';
import type { FieldChangeContext, FieldValidationContext } from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorValues } from '../core/editor-values.js';

function assertAdapter<TValue>(
  adapter: CustomFieldAdapter<TValue>,
  fieldName: string,
): void {
  const candidate: unknown = adapter;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" must create an adapter object.`,
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!(record['control'] instanceof HTMLElement)) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" must provide an HTMLElement control.`,
    );
  }
  for (const methodName of [
    'destroy',
    'focus',
    'getValue',
    'setDisabled',
    'setReadOnly',
    'setRequired',
    'setValue',
  ]) {
    if (typeof record[methodName] !== 'function') {
      throw new EditorConfigurationError(
        `Custom field "${fieldName}" adapter requires a ${methodName} method.`,
      );
    }
  }
  if (record['validate'] !== undefined && typeof record['validate'] !== 'function') {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" adapter validate property must be a function.`,
    );
  }
}

function assertValidationResult(result: FieldValidationResult, fieldName: string): void {
  const candidate: unknown = result;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" validation must return a result object.`,
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (
    typeof record['valid'] !== 'boolean' ||
    (record['message'] !== undefined && typeof record['message'] !== 'string')
  ) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" validation result is not valid.`,
    );
  }
}

/** Creates the managed controller that integrates one consumer-owned widget. */
export function createCustomFieldController<TFormValues extends object>(
  config: Readonly<CustomFieldConfig<TFormValues>>,
  fieldId: string,
  language: Readonly<AltEditorLiteLanguage>,
  onUserChange: () => void,
  lifecycleSignal: AbortSignal,
): ManagedFieldController<TFormValues> {
  const context: Readonly<CustomFieldControllerContext> = Object.freeze({
    language,
    onUserChange,
    signal: lifecycleSignal,
  });
  const adapter = config.definition.createController(config.options, context);
  assertAdapter(adapter, config.name);
  const { control } = adapter;
  const shell = createFieldControllerShell({
    config,
    control,
    fieldId,
    useAriaLabelReference: true,
  });
  let isDisabled = config.disabled ?? false;
  let isReadOnly = config.readOnly ?? false;
  let isRequired = config.required ?? false;
  let isDestroyed = false;

  const applyDisabled = (disabled: boolean): void => {
    isDisabled = disabled;
    control.setAttribute('aria-disabled', String(disabled));
    adapter.setDisabled(disabled);
  };
  const applyReadOnly = (readOnly: boolean): void => {
    isReadOnly = readOnly;
    control.setAttribute('aria-readonly', String(readOnly));
    adapter.setReadOnly(readOnly);
  };
  const applyRequired = (required: boolean): void => {
    isRequired = required;
    control.setAttribute('aria-required', String(required));
    adapter.setRequired(required);
  };

  try {
    applyDisabled(isDisabled);
    applyReadOnly(isReadOnly);
    applyRequired(isRequired);
  } catch (error: unknown) {
    try {
      runCleanupSteps([
        () => {
          adapter.destroy();
        },
        () => {
          shell.element.remove();
        },
      ]);
    } catch {
      // Preserve the initialization failure.
    }
    throw error;
  }

  return {
    name: config.name,
    element: shell.element,
    getValue: () => adapter.getValue(),
    setValue: (value) => {
      adapter.setValue(value);
    },
    setDisabled: applyDisabled,
    isDisabled: () => isDisabled,
    setReadOnly: applyReadOnly,
    isReadOnly: () => isReadOnly,
    setRequired: applyRequired,
    isRequired: () => isRequired,
    focus: () => {
      adapter.focus();
    },
    validateNative: () => ({ valid: true }),
    validateCustom: async (
      values: Readonly<EditorValues<TFormValues>>,
      signal: AbortSignal,
    ) => {
      if (adapter.validate !== undefined) {
        const widgetResult = await Promise.resolve(adapter.validate());
        signal.throwIfAborted();
        assertValidationResult(widgetResult, config.name);
        if (!widgetResult.valid) {
          return widgetResult;
        }
      }
      if (config.validate === undefined) {
        return { valid: true };
      }
      const validationContext: FieldValidationContext<TFormValues> = {
        signal,
        values,
      };
      const value = await Promise.resolve(adapter.getValue());
      signal.throwIfAborted();
      return await Promise.resolve(config.validate(value, validationContext));
    },
    runOnChange: async (
      values: Readonly<EditorValues<TFormValues>>,
      signal: AbortSignal,
    ) => {
      if (config.onChange === undefined) {
        return;
      }
      const changeContext: FieldChangeContext<TFormValues> = { signal, values };
      const value = await Promise.resolve(adapter.getValue());
      signal.throwIfAborted();
      await Promise.resolve(config.onChange(value, changeContext));
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
      runCleanupSteps([
        () => {
          adapter.destroy();
        },
        () => {
          shell.element.remove();
        },
      ]);
    },
  };
}
