import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { settleWithAbort } from '../core/settle-with-abort.js';

import { createFieldControllerShell } from './field-controller-shell.js';

import type {
  CustomFieldAdapter,
  CustomFieldConfig,
  CustomFieldControllerContext,
  CustomFieldPresentation,
} from './custom-field.js';
import type { FieldChangeContext, FieldValidationContext } from './field-config.js';
import type { FieldControllerShell } from './field-controller-shell.js';
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
  if (
    record['ariaTarget'] !== undefined &&
    !(record['ariaTarget'] instanceof HTMLElement)
  ) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" ariaTarget must be an HTMLElement.`,
    );
  }
  if (
    record['ariaTarget'] instanceof HTMLElement &&
    !record['control'].contains(record['ariaTarget'])
  ) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" ariaTarget must be the control or one of its descendants.`,
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
  if (
    record['containsFocusTarget'] !== undefined &&
    typeof record['containsFocusTarget'] !== 'function'
  ) {
    throw new EditorConfigurationError(
      `Custom field "${fieldName}" adapter containsFocusTarget property must be a function.`,
    );
  }
}

function destroyReturnedAdapter(candidate: unknown): void {
  if (typeof candidate !== 'object' || candidate === null) {
    return;
  }
  const destroy = (candidate as Readonly<Record<string, unknown>>)['destroy'];
  if (typeof destroy === 'function') {
    Reflect.apply(destroy, candidate, []);
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
  presentation: CustomFieldPresentation,
  lifecycleSignal: AbortSignal,
): ManagedFieldController<TFormValues> {
  const context: Readonly<CustomFieldControllerContext> = Object.freeze({
    language,
    onUserChange,
    presentation,
    signal: lifecycleSignal,
  });
  const adapter = config.definition.createController(config.options, context);
  let shell: FieldControllerShell | undefined;

  try {
    assertAdapter(adapter, config.name);
    const { control } = adapter;
    const initializedShell = createFieldControllerShell({
      ...(adapter.ariaTarget === undefined ? {} : { ariaTarget: adapter.ariaTarget }),
      config,
      control,
      fieldId,
      useAriaLabelReference: true,
    });
    shell = initializedShell;
    let isDisabled = config.disabled ?? false;
    let isReadOnly = config.readOnly ?? false;
    let isRequired = config.required ?? false;
    let isDestroyed = false;

    const applyDisabled = (disabled: boolean): void => {
      isDisabled = disabled;
      adapter.setDisabled(disabled);
    };
    const applyReadOnly = (readOnly: boolean): void => {
      isReadOnly = readOnly;
      adapter.setReadOnly(readOnly);
    };
    const applyRequired = (required: boolean): void => {
      isRequired = required;
      adapter.setRequired(required);
    };

    applyDisabled(isDisabled);
    applyReadOnly(isReadOnly);
    applyRequired(isRequired);

    return {
      name: config.name,
      element: initializedShell.element,
      getValue: (signal = lifecycleSignal) => settleWithAbort(adapter.getValue(), signal),
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
      containsFocusTarget: (target) =>
        adapter.containsFocusTarget?.(target) ??
        (target === null ? false : control.contains(target)),
      validateNative: () => ({ valid: true }),
      validateCustom: async (
        values: Readonly<EditorValues<TFormValues>>,
        signal: AbortSignal,
      ) => {
        if (adapter.validate !== undefined) {
          const widgetResult = await settleWithAbort(adapter.validate(signal), signal);
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
        const value = await settleWithAbort(adapter.getValue(), signal);
        return await settleWithAbort(config.validate(value, validationContext), signal);
      },
      runOnChange: async (
        values: Readonly<EditorValues<TFormValues>>,
        signal: AbortSignal,
      ) => {
        if (config.onChange === undefined) {
          return;
        }
        const changeContext: FieldChangeContext<TFormValues> = { signal, values };
        const value = await settleWithAbort(adapter.getValue(), signal);
        await settleWithAbort(config.onChange(value, changeContext), signal);
      },
      clearError: () => {
        initializedShell.clearError();
      },
      showError: (message) => {
        initializedShell.showError(message);
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
            initializedShell.element.remove();
          },
        ]);
      },
    };
  } catch (error: unknown) {
    try {
      runCleanupSteps([
        () => {
          destroyReturnedAdapter(adapter);
        },
        () => {
          shell?.element.remove();
        },
      ]);
    } catch {
      // Preserve the initialization failure.
    }
    throw error;
  }
}
