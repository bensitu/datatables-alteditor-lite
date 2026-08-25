import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { parseFieldPath } from '../object-path/field-path.js';

import { isInlineFieldEligible } from './inline-field-capability.js';

import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { ResolvedEditingOptions } from '../core/resolve-editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api } from 'datatables.net';

const blurActions = new Set(['submit', 'cancel', 'none']);
const enterActions = new Set(['submit', 'none']);
const tabActions = new Set(['submit-and-move', 'submit', 'none']);
const updateModes = new Set(['replace-row', 'refresh']);
const classTokenPattern = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/u;

function assertChoice(
  value: unknown,
  allowed: ReadonlySet<string>,
  propertyName: string,
): void {
  if (value !== undefined && (typeof value !== 'string' || !allowed.has(value))) {
    throw new EditorConfigurationError(`editing.inline.${propertyName} is not valid.`);
  }
}

function assertClassName(className: unknown): void {
  if (className === undefined) {
    return;
  }
  if (
    typeof className !== 'string' ||
    className.trim().length === 0 ||
    className.split(/\s+/u).some((token) => !classTokenPattern.test(token))
  ) {
    throw new EditorConfigurationError('editing.inline.className is not valid.');
  }
}

function formatPropertyNames(propertyNames: readonly string[]): string {
  if (propertyNames.length < 2) {
    return propertyNames[0] ?? '';
  }
  if (propertyNames.length === 2) {
    return propertyNames.join(' and ');
  }
  return `${propertyNames.slice(0, -1).join(', ')}, and ${propertyNames[propertyNames.length - 1] ?? ''}`;
}

function assertExplicitMappings<TRow extends object, TFormValues extends object>(
  table: Api<TRow>,
  fields: readonly FieldConfig<TFormValues>[],
  columns: unknown,
): void {
  if (columns === undefined) {
    return;
  }
  if (typeof columns !== 'object' || columns === null || Array.isArray(columns)) {
    throw new EditorConfigurationError('editing.inline.columns must be an object.');
  }

  const fieldByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
    fields.map((field) => [field.name, field]),
  );
  const columnNames = table.columns().names().toArray();
  for (const [columnName, fieldName] of Object.entries(columns)) {
    if (columnName.trim().length === 0) {
      throw new EditorConfigurationError(
        'Each editing.inline.columns key must be a non-empty DataTables column name.',
      );
    }

    const matches = columnNames.filter((name) => name === columnName).length;
    if (matches !== 1) {
      throw new EditorConfigurationError(
        `editing.inline.columns key "${columnName}" must match one unique DataTables column name.`,
      );
    }
    if (fieldName === false) {
      continue;
    }
    if (typeof fieldName !== 'string') {
      throw new EditorConfigurationError(
        `editing.inline.columns value for "${columnName}" must be a field path or false.`,
      );
    }

    parseFieldPath(fieldName);
    const field = fieldByName.get(fieldName);
    if (field === undefined) {
      throw new EditorConfigurationError(
        `editing.inline.columns maps "${columnName}" to an unknown field "${fieldName}".`,
      );
    }
    if (field.inlineEdit !== true) {
      throw new EditorConfigurationError(
        `Field "${fieldName}" must enable inlineEdit before it can be mapped.`,
      );
    }
    if (!isInlineFieldEligible(field)) {
      throw new EditorConfigurationError(
        `Field "${fieldName}" does not support inline editing.`,
      );
    }
  }
}

/** Validates inline options and exact DataTables column mappings. */
export function validateInlineConfiguration<
  TRow extends object,
  TFormValues extends object,
>(
  table: Api<TRow>,
  options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>,
  editing: Readonly<ResolvedEditingOptions<TFormValues>>,
): void {
  const inline = options.editing?.inline;

  assertChoice(inline?.blurAction, blurActions, 'blurAction');
  assertChoice(inline?.enterAction, enterActions, 'enterAction');
  assertChoice(inline?.tabAction, tabActions, 'tabAction');
  assertChoice(inline?.updateMode, updateModes, 'updateMode');
  assertClassName(inline?.className);
  assertExplicitMappings(table, options.fields, inline?.columns);

  const incompatibleHoverActions =
    editing.inline.activation === 'hover'
      ? [
          inline?.blurAction !== undefined && inline.blurAction !== 'none'
            ? 'blurAction'
            : undefined,
          inline?.enterAction !== undefined && inline.enterAction !== 'none'
            ? 'enterAction'
            : undefined,
          inline?.tabAction !== undefined && inline.tabAction !== 'none'
            ? 'tabAction'
            : undefined,
        ].filter((propertyName): propertyName is string => propertyName !== undefined)
      : [];
  if (incompatibleHoverActions.length > 0) {
    throw new EditorConfigurationError(
      `Hover activation requires ${formatPropertyNames(incompatibleHoverActions)} to be "none" when configured.`,
    );
  }

  if (editing.inline.enabled && !options.fields.some(isInlineFieldEligible)) {
    throw new EditorConfigurationError(
      'Inline editing requires at least one supported inlineEdit field.',
    );
  }

  if (inline?.updateMode === 'refresh') {
    if (
      options.operations?.update === undefined ||
      options.operations.refresh === undefined
    ) {
      throw new EditorConfigurationError(
        'editing.inline.updateMode "refresh" requires operations.update and operations.refresh.',
      );
    }
  }
}
