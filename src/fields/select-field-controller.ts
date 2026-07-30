import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';
import { OptionTokenMap } from './option-token-map.js';

import type { SelectFieldConfig } from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';

/**
 * Creates a native select that round-trips string and number values.
 *
 * @param config - Typed select configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createSelectFieldController<
  TFormValues extends object,
  TValue extends string | number,
>(
  config: SelectFieldConfig<TFormValues, TValue>,
  fieldId: string,
  invalidMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const selectElement = document.createElement('select');
  const tokenMap = new OptionTokenMap(config.options);
  const clearOption = document.createElement('option');
  let committedToken = '';
  let isReadOnly = false;

  if (config.allowClear === true) {
    clearOption.value = '';
    clearOption.textContent = '';
    selectElement.append(clearOption);
  }

  for (const [token, option] of tokenMap.entries()) {
    const optionElement = document.createElement('option');
    optionElement.value = token;
    optionElement.textContent = option.label;
    optionElement.disabled = option.disabled ?? false;
    selectElement.append(optionElement);
  }

  const preventReadOnlyInteraction = (event: Event): void => {
    if (isReadOnly) {
      event.preventDefault();
    }
  };
  const preserveReadOnlyValue = (): void => {
    if (isReadOnly) {
      selectElement.value = committedToken;
    } else {
      committedToken = selectElement.value;
    }
  };

  selectElement.addEventListener('pointerdown', preventReadOnlyInteraction);
  selectElement.addEventListener('keydown', preventReadOnlyInteraction);
  selectElement.addEventListener('change', preserveReadOnlyValue);

  const adapter: NativeControlAdapter<TValue | undefined> = {
    control: selectElement,
    readValue: () => tokenMap.valueForToken(selectElement.value),
    writeValue: (value: unknown) => {
      if (value === undefined) {
        selectElement.value = '';
        committedToken = selectElement.value;
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

      selectElement.value = token;
      committedToken = token;
    },
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      committedToken = selectElement.value;
      selectElement.setAttribute('aria-readonly', String(nextReadOnly));
    },
    validateNative: () =>
      selectElement.checkValidity()
        ? { valid: true }
        : { valid: false, message: selectElement.validationMessage },
    destroy: () => {
      selectElement.removeEventListener('pointerdown', preventReadOnlyInteraction);
      selectElement.removeEventListener('keydown', preventReadOnlyInteraction);
      selectElement.removeEventListener('change', preserveReadOnlyValue);
    },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    onUserChange,
  });
}
