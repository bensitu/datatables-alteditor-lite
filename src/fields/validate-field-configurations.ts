import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { parseFieldPath } from '../object-path/field-path.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from '../search-select/search-select.js';

import { assertAllowedFieldAttributes } from './field-attributes.js';
import { assertUniqueOptionValues } from './option-token-map.js';

import type { FieldConfig } from './field-config.js';

function assertPositiveLimit(
  limit: number | undefined,
  propertyName: string,
  fieldName: string,
): void {
  if (
    limit !== undefined &&
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
    assertAllowedFieldAttributes(config.attributes);

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
      (config.type === 'select' ||
        config.type === 'radio' ||
        config.type === 'search-select') &&
      config.options.length === 0
    ) {
      throw new EditorConfigurationError(
        `Field "${config.name}" requires at least one option.`,
      );
    }

    if (
      config.type === 'select' ||
      config.type === 'radio' ||
      config.type === 'search-select'
    ) {
      assertUniqueOptionValues<string | number>(config.options);
    }

    if (config.type === 'search-select') {
      if (config.options.length > SEARCH_SELECT_MAX_OPTION_COUNT) {
        throw new EditorConfigurationError(
          `Field "${config.name}" exceeds the ${String(SEARCH_SELECT_MAX_OPTION_COUNT)}-option SearchSelect limit.`,
        );
      }
      assertNonNegativeInteger(config.searchThreshold, 'searchThreshold', config.name);
      assertNonNegativeInteger(config.debounceMs, 'debounceMs', config.name);
      if (
        config.allowManualValue === true &&
        config.options.some(({ value }) => typeof value !== 'string')
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
