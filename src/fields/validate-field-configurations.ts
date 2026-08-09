import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { parseFieldPath } from '../object-path/field-path.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from '../search-select/search-select.js';

import { assertAllowedFieldAttributes } from './field-attributes.js';
import { assertUniqueOptionValues } from './option-token-map.js';

import type { FieldConfig } from './field-config.js';

function hasConfiguredOption(
  options: readonly { readonly value: string | number }[],
  value: unknown,
): boolean {
  return options.some((option) => Object.is(option.value, value));
}

function assertValidDefaultValue<TFormValues extends object>(
  config: FieldConfig<TFormValues>,
): void {
  if (!Object.hasOwn(config, 'defaultValue')) {
    return;
  }

  const defaultValue: unknown = config.defaultValue;
  let isValid: boolean;
  switch (config.type) {
    case 'checkbox': {
      isValid = typeof defaultValue === 'boolean';
      break;
    }
    case 'number': {
      isValid =
        (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) ||
        (config.emptyValue === null && defaultValue === null) ||
        (config.emptyValue !== null && defaultValue === undefined);
      break;
    }
    case 'radio':
    case 'select': {
      isValid =
        defaultValue === undefined || hasConfiguredOption(config.options, defaultValue);
      break;
    }
    case 'search-select': {
      isValid =
        defaultValue === undefined ||
        (typeof config.loadOptions === 'function' &&
          (typeof defaultValue === 'string' || typeof defaultValue === 'number')) ||
        hasConfiguredOption(config.options ?? [], defaultValue) ||
        (config.allowManualValue === true && typeof defaultValue === 'string');
      break;
    }
    case 'file': {
      isValid =
        config.multiple === true
          ? Array.isArray(defaultValue) && defaultValue.length === 0
          : defaultValue === null;
      break;
    }
    case 'date':
    case 'datetime-local':
    case 'email':
    case 'hidden':
    case 'password':
    case 'text':
    case 'textarea':
    case 'time': {
      isValid = typeof defaultValue === 'string';
      break;
    }
  }

  if (!isValid) {
    throw new EditorConfigurationError(
      `defaultValue for field "${config.name}" is not valid for a ${config.type} field.`,
    );
  }
}

function assertPositiveLimit(
  limit: number | null | undefined,
  propertyName: string,
  fieldName: string,
): void {
  if (
    limit !== undefined &&
    limit !== null &&
    (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit))
  ) {
    throw new EditorConfigurationError(
      `${propertyName} for field "${fieldName}" must be a positive integer.`,
    );
  }
}

function assertNonNegativeInteger(
  value: number | undefined,
  propertyName: string,
  fieldName: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))
  ) {
    throw new EditorConfigurationError(
      `${propertyName} for field "${fieldName}" must be a non-negative integer.`,
    );
  }
}

/**
 * Validates runtime field invariants before an editor claims its table.
 *
 * @param fields - Consumer field configurations.
 * @throws EditorConfigurationError for malformed or ambiguous configuration.
 */
export function validateFieldConfigurations<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
): void {
  const configuredNames = new Set<string>();

  for (const config of fields) {
    parseFieldPath(config.name);

    if (configuredNames.has(config.name)) {
      throw new EditorConfigurationError(
        `Field path "${config.name}" is configured more than once.`,
      );
    }
    configuredNames.add(config.name);
    assertAllowedFieldAttributes(config.attributes, config.type);
    assertValidDefaultValue(config);

    if (config.type === 'hidden') {
      if (Object.hasOwn(config, 'label')) {
        throw new EditorConfigurationError(
          `Hidden field "${config.name}" cannot define a label.`,
        );
      }
    } else if (typeof config.label !== 'string' || config.label.trim().length === 0) {
      throw new EditorConfigurationError(
        `Visible field "${config.name}" requires a label.`,
      );
    }

    if (
      (config.type === 'select' || config.type === 'radio') &&
      config.options.length === 0
    ) {
      throw new EditorConfigurationError(
        `Field "${config.name}" requires at least one option.`,
      );
    }

    if (config.type === 'select' || config.type === 'radio') {
      assertUniqueOptionValues<string | number>(config.options);
    }

    if (config.type === 'search-select') {
      const options = config.options ?? [];
      const loadOptions: unknown = config.loadOptions;
      const resolveOption: unknown = config.resolveOption;
      const hasLoader = typeof loadOptions === 'function';
      const hasResolver = typeof resolveOption === 'function';
      const hasRemoteConfiguration =
        loadOptions !== undefined || resolveOption !== undefined;
      const isRemote = hasRemoteConfiguration && hasLoader && hasResolver;
      if (hasRemoteConfiguration && !isRemote) {
        throw new EditorConfigurationError(
          `Remote SearchSelect field "${config.name}" requires loadOptions and resolveOption.`,
        );
      }
      if (!isRemote && options.length === 0) {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires at least one option.`,
        );
      }
      if (options.length > SEARCH_SELECT_MAX_OPTION_COUNT) {
        throw new EditorConfigurationError(
          `Field "${config.name}" exceeds the ${String(SEARCH_SELECT_MAX_OPTION_COUNT)}-option SearchSelect limit.`,
        );
      }
      assertUniqueOptionValues<string | number>(options);
      assertNonNegativeInteger(config.searchThreshold, 'searchThreshold', config.name);
      assertNonNegativeInteger(config.debounceMs, 'debounceMs', config.name);
      if (
        config.allowManualValue === true &&
        options.some(({ value }) => typeof value !== 'string')
      ) {
        throw new EditorConfigurationError(
          `Field "${config.name}" can allow manual values only with string options.`,
        );
      }
    }

    if (config.type === 'file') {
      assertPositiveLimit(config.maxFileBytes, 'maxFileBytes', config.name);
      if (config.multiple === true) {
        assertPositiveLimit(config.maxFileCount, 'maxFileCount', config.name);
      }
    }

    if (
      config.type === 'textarea' &&
      config.rows !== undefined &&
      (!Number.isInteger(config.rows) || config.rows <= 0)
    ) {
      throw new EditorConfigurationError(
        `rows for field "${config.name}" must be a positive integer.`,
      );
    }
  }
}
