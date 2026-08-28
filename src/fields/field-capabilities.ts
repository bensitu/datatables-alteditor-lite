import type { FieldConfig } from './field-config.js';

/** Editing surfaces available for one validated field configuration. */
export interface ResolvedFieldCapabilities {
  readonly dialog: boolean;
  readonly batch: boolean;
  readonly inline: boolean;
}

export type FieldBatchRestriction =
  'file' | 'unique' | 'disabled-by-config' | 'unsupported-by-field';

const builtinInlineTypes = new Set([
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

/** Returns whether a field can provide a single-value inline control. */
export function supportsInlineFieldType<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return field.type === 'custom'
    ? field.definition.capabilities?.inline === true
    : builtinInlineTypes.has(field.type);
}

/** Returns why a field cannot accept a common multi-record value. */
export function resolveBatchFieldRestriction<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): FieldBatchRestriction | undefined {
  if (field.type === 'file') {
    return 'file';
  }
  if (field.unique === true) {
    return 'unique';
  }
  if (
    field.editable === false ||
    field.type === 'hidden' ||
    field.batchEditable === false
  ) {
    return 'disabled-by-config';
  }
  if (field.type === 'custom' && field.definition.capabilities?.batch !== true) {
    return 'unsupported-by-field';
  }
  return undefined;
}

/** Resolves dialog, multi-record, and inline participation in one place. */
export function resolveFieldCapabilities<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): Readonly<ResolvedFieldCapabilities> {
  const isDialogAvailable = field.editable !== false;
  const isBatchAvailable = resolveBatchFieldRestriction(field) === undefined;
  const isInlineAvailable =
    field.inlineEdit === true &&
    supportsInlineFieldType(field) &&
    isDialogAvailable &&
    field.disabled !== true &&
    field.visible !== false &&
    !('readOnly' in field && field.readOnly);

  return Object.freeze({
    batch: isBatchAvailable,
    dialog: isDialogAvailable,
    inline: isInlineAvailable,
  });
}
