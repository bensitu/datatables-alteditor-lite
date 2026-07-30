import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

const ALLOWED_FIELD_ATTRIBUTES = new Set([
  'accept',
  'aria-label',
  'autocapitalize',
  'autocomplete',
  'capture',
  'inputmode',
  'max',
  'maxlength',
  'min',
  'minlength',
  'pattern',
  'placeholder',
  'spellcheck',
  'step',
]);

/**
 * Validates that every requested native control attribute is allowlisted.
 *
 * @param attributes - Requested attribute names and values.
 * @throws EditorConfigurationError when an attribute is not allowlisted.
 */
export function assertAllowedFieldAttributes(
  attributes: Readonly<Record<string, string>> | undefined,
): void {
  if (attributes === undefined) {
    return;
  }

  for (const attributeName of Object.keys(attributes)) {
    if (
      attributeName.toLowerCase().startsWith('on') ||
      !ALLOWED_FIELD_ATTRIBUTES.has(attributeName.toLowerCase())
    ) {
      throw new EditorConfigurationError(
        `Field attribute "${attributeName}" is not allowed.`,
      );
    }
  }
}

/**
 * Applies only explicitly allowlisted native control attributes.
 *
 * @param control - Consumer-independent field control.
 * @param attributes - Requested attribute names and values.
 * @throws EditorConfigurationError when an attribute is not allowlisted.
 */
export function applyAllowedFieldAttributes(
  control: HTMLElement,
  attributes: Readonly<Record<string, string>> | undefined,
): void {
  assertAllowedFieldAttributes(attributes);

  for (const [attributeName, attributeValue] of Object.entries(attributes ?? {})) {
    control.setAttribute(attributeName.toLowerCase(), attributeValue);
  }
}
