import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';

import type { TextareaFieldConfig } from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';

/**
 * Creates a multiline string controller.
 *
 * @param config - Textarea configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createTextareaFieldController<TFormValues extends object>(
  config: TextareaFieldConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const textareaElement = document.createElement('textarea');

  if (config.rows !== undefined) {
    textareaElement.rows = config.rows;
  }

  const adapter: NativeControlAdapter<string> = {
    control: textareaElement,
    readValue: () =>
      config.trim === true ? textareaElement.value.trim() : textareaElement.value,
    writeValue: (value: unknown) => {
      if (typeof value !== 'string') {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a string value.`,
        );
      }

      textareaElement.value = value;
    },
    setReadOnly: (isReadOnly: boolean) => {
      textareaElement.readOnly = isReadOnly;
    },
    validateNative: () =>
      textareaElement.checkValidity()
        ? { valid: true }
        : { valid: false, message: textareaElement.validationMessage },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    onUserChange,
    changeEvent: 'input',
  });
}
