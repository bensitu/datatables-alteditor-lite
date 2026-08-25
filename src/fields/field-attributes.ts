import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { hasOwn } from '../core/has-own.js';

export type FieldAttributeTarget =
  | 'checkbox'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'number'
  | 'password'
  | 'radio'
  | 'search-select'
  | 'select'
  | 'text'
  | 'textarea'
  | 'time';

const TEXT_FIELD_ATTRIBUTES = new Set([
  'aria-label',
  'autocapitalize',
  'autocomplete',
  'inputmode',
  'maxlength',
  'minlength',
  'pattern',
  'placeholder',
  'spellcheck',
]);
const NUMBER_FIELD_ATTRIBUTES = new Set([
  'aria-label',
  'autocomplete',
  'inputmode',
  'max',
  'min',
  'placeholder',
  'step',
]);
const TEMPORAL_FIELD_ATTRIBUTES = new Set([
  'aria-label',
  'autocomplete',
  'max',
  'min',
  'step',
]);
const ALLOWED_ATTRIBUTES_BY_TARGET: Readonly<
  Record<FieldAttributeTarget, ReadonlySet<string>>
> = {
  checkbox: new Set(['aria-label', 'autocomplete']),
  date: TEMPORAL_FIELD_ATTRIBUTES,
  'datetime-local': TEMPORAL_FIELD_ATTRIBUTES,
  email: TEXT_FIELD_ATTRIBUTES,
  file: new Set(['accept', 'aria-label', 'capture']),
  hidden: new Set(['autocomplete']),
  number: NUMBER_FIELD_ATTRIBUTES,
  password: TEXT_FIELD_ATTRIBUTES,
  radio: new Set(['aria-label', 'autocomplete']),
  'search-select': TEXT_FIELD_ATTRIBUTES,
  select: new Set(['aria-label', 'autocomplete']),
  text: TEXT_FIELD_ATTRIBUTES,
  textarea: TEXT_FIELD_ATTRIBUTES,
  time: TEMPORAL_FIELD_ATTRIBUTES,
};

function attributeTargetForControl(control: HTMLElement): FieldAttributeTarget {
  if (control instanceof HTMLSelectElement) {
    return 'select';
  }
  if (control instanceof HTMLTextAreaElement) {
    return 'textarea';
  }
  if (control instanceof HTMLInputElement) {
    const inputType = control.type;
    if (hasOwn(ALLOWED_ATTRIBUTES_BY_TARGET, inputType)) {
      return inputType as FieldAttributeTarget;
    }
  }

  return 'text';
}

/**
 * Validates that every requested native control attribute is allowlisted.
 *
 * @param attributes - Requested attribute names and values.
 * @throws EditorConfigurationError when an attribute is not allowlisted.
 */
export function assertAllowedFieldAttributes(
  attributes: Readonly<Record<string, string>> | undefined,
  target: FieldAttributeTarget,
): void {
  if (attributes === undefined) {
    return;
  }

  const allowedAttributes = ALLOWED_ATTRIBUTES_BY_TARGET[target];
  for (const attributeName of Object.keys(attributes)) {
    if (!allowedAttributes.has(attributeName.toLowerCase())) {
      throw new EditorConfigurationError(
        `Field attribute "${attributeName}" is not allowed for ${target} fields.`,
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
  assertAllowedFieldAttributes(attributes, attributeTargetForControl(control));

  for (const [attributeName, attributeValue] of Object.entries(attributes ?? {})) {
    control.setAttribute(attributeName.toLowerCase(), attributeValue);
  }
}
