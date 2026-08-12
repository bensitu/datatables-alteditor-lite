import { SearchSelect } from '../search-select/search-select.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';

import type {
  SearchSelectFieldConfig,
  RemoteSearchSelectSource,
  SelectOption,
  VisibleFieldConfig,
} from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

type ControllerConfig<TFormValues extends object> =
  | SearchSelectFieldConfig<TFormValues>
  | SearchSelectFieldConfig<TFormValues, number>
  | SearchSelectFieldConfig<TFormValues, string | number>;

/**
 * Creates a typed local SearchSelect field controller.
 *
 * @param config - Validated SearchSelect configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param language - Complete resolved language.
 * @param onUserChange - Form-owned committed-value notification.
 * @returns Managed field controller with dynamic option support.
 */
export function createSearchSelectFieldController<TFormValues extends object>(
  config: ControllerConfig<TFormValues>,
  fieldId: string,
  language: Readonly<AltEditorLiteLanguage>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const remoteConfig = config.remote as
    Readonly<RemoteSearchSelectSource<string | number>> | undefined;
  const isSearchEnabled = config.search?.enabled ?? true;
  const searchSelect = new SearchSelect<string | number>({
    allowClear: config.allowClear ?? false,
    allowManualValue: config.allowManualValue ?? false,
    debounceMs: config.search?.debounceMs ?? (remoteConfig === undefined ? 0 : 250),
    fieldId,
    locale: language.locale,
    messages: {
      clear: language.searchSelect.clear,
      instructions: language.accessibility.searchSelectInstructions,
      noResults: language.searchSelect.noResults,
      loading: language.searchSelect.loading,
      loadError: language.searchSelect.loadError,
      placeholder: language.searchSelect.placeholder,
      results: language.accessibility.searchSelectResults,
      searchPlaceholder: language.searchSelect.searchPlaceholder,
      selection: language.accessibility.searchSelectSelection,
      searchTooShort: language.searchSelect.searchTooShort,
    },
    onCommit: onUserChange,
    options: config.options ?? [],
    ...(remoteConfig === undefined
      ? {}
      : {
          loadOptions: remoteConfig.loadOptions,
          resolveOption: remoteConfig.resolveOption,
        }),
    searchEnabled: isSearchEnabled,
    searchThreshold: config.search?.threshold ?? 0,
    sortOptions: config.sortOptions ?? false,
  });

  const adapter: NativeControlAdapter<string | number | undefined> = {
    control: searchSelect.inputElement,
    readValue: () => searchSelect.getValue(),
    writeValue: (value: unknown) => {
      searchSelect.setValue(value);
    },
    setReadOnly: (isReadOnly: boolean) => {
      searchSelect.setReadOnly(isReadOnly);
    },
    validateNative: () =>
      searchSelect.isRequired() && searchSelect.getValue() === undefined
        ? { valid: false, message: language.validation.required }
        : { valid: true },
    destroy: () => {
      searchSelect.destroy();
    },
  };
  // Field configurations are validated before the controller is constructed.
  const foundationConfig = config as unknown as VisibleFieldConfig<
    TFormValues,
    string | number | undefined
  >;
  const nativeController = createNativeControlController<
    TFormValues,
    string | number | undefined
  >({
    adapter,
    config: foundationConfig,
    controlContainer: searchSelect.element,
    fieldId,
    invalidMessage: language.validation.invalid,
    onUserChange: () => undefined,
    requiredMessage: language.validation.required,
  });
  const describedBy = searchSelect.inputElement.getAttribute('aria-describedby');
  const descriptionIds = new Set(describedBy?.split(/\s+/u) ?? []);
  descriptionIds.add(searchSelect.instructionsId);
  searchSelect.inputElement.setAttribute(
    'aria-describedby',
    [...descriptionIds].filter((id) => id.length > 0).join(' '),
  );

  searchSelect.setDisabled(config.disabled ?? false);
  searchSelect.setReadOnly(config.readOnly ?? false);
  searchSelect.setRequired(config.required ?? false);

  return {
    ...nativeController,
    getOptions: () => searchSelect.getOptions(),
    setDisabled: (isDisabled: boolean) => {
      nativeController.setDisabled(isDisabled);
      searchSelect.setDisabled(isDisabled);
    },
    setOptions: (options: readonly SelectOption[]) => {
      searchSelect.setOptions(options);
    },
    setReadOnly: (isReadOnly: boolean) => {
      nativeController.setReadOnly(isReadOnly);
      searchSelect.setReadOnly(isReadOnly);
    },
    isReadOnly: () => searchSelect.isReadOnly(),
    setRequired: (isRequired: boolean) => {
      nativeController.setRequired(isRequired);
      searchSelect.setRequired(isRequired);
    },
    isRequired: () => searchSelect.isRequired(),
  };
}
