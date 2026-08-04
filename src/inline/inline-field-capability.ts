import type { FieldConfig } from '../fields/field-config.js';

const supportedTypes = new Set([
  'text',
  'email',
  'number',
  'date',
  'time',
  'datetime-local',
  'checkbox',
  'select',
  'textarea',
  'search-select',
]);

/** Returns whether a field type has a safe single-value inline control. */
export function supportsInlineField<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return supportedTypes.has(field.type);
}

/** Returns whether a configured field can be opened for inline editing. */
export function isInlineFieldEligible<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return (
    field.inlineEdit === true &&
    supportsInlineField(field) &&
    field.editable !== false &&
    field.disabled !== true &&
    field.visible !== false &&
    field.type !== 'hidden' &&
    !('readonly' in field && field.readonly)
  );
}
