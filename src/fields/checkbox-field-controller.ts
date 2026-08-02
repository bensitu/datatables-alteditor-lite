import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';

import type { CheckboxFieldConfig } from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';

/**
 * Creates a boolean checkbox controller with controlled readonly behavior.
 *
 * @param config - Checkbox configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createCheckboxFieldController<TFormValues extends object>(
  config: CheckboxFieldConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  inputElement.type = 'checkbox';
  let isReadOnly = false;

  const preventReadOnlyMutation = (event: Event): void => {
    if (isReadOnly) {
      event.preventDefault();
    }
  };

  inputElement.addEventListener('click', preventReadOnlyMutation);

  const adapter: NativeControlAdapter<boolean> = {
    control: inputElement,
    readValue: () => inputElement.checked,
    writeValue: (value: unknown) => {
      if (typeof value !== 'boolean') {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a boolean value.`,
        );
      }

      inputElement.checked = value;
    },
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      inputElement.setAttribute('aria-readonly', String(nextReadOnly));
    },
    validateNative: () =>
      inputElement.checkValidity() ? { valid: true } : { valid: false },
    destroy: () => {
      inputElement.removeEventListener('click', preventReadOnlyMutation);
    },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    labelPlacement: 'after-control',
    onUserChange,
    requiredMessage,
  });
}
