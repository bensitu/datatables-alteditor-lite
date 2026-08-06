import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { parseFieldPath } from '../object-path/field-path.js';

import { isInlineFieldEligible } from './inline-field-capability.js';

import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { EditMode } from '../core/edit-mode.js';
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
    throw new EditorConfigurationError(`inline.${propertyName} is not valid.`);
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
    throw new EditorConfigurationError('inline.className is not valid.');
  }
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
    throw new EditorConfigurationError('inline.columns must be an object.');
  }

  const fieldByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
    fields.map((field) => [field.name, field]),
  );
  const columnNames = table.columns().names().toArray();
  for (const [columnName, fieldName] of Object.entries(columns)) {
    if (columnName.trim().length === 0) {
      throw new EditorConfigurationError(
        'Each inline.columns key must be a non-empty DataTables column name.',
      );
    }

    const matches = columnNames.filter((name) => name === columnName).length;
    if (matches !== 1) {
      throw new EditorConfigurationError(
        `inline.columns key "${columnName}" must match one unique DataTables column name.`,
      );
    }
    if (fieldName === false) {
      continue;
    }
    if (typeof fieldName !== 'string') {
      throw new EditorConfigurationError(
        `inline.columns value for "${columnName}" must be a field path or false.`,
      );
    }

    parseFieldPath(fieldName);
    const field = fieldByName.get(fieldName);
    if (field === undefined) {
      throw new EditorConfigurationError(
        `inline.columns maps "${columnName}" to an unknown field "${fieldName}".`,
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
  editMode: EditMode,
): void {
  const inline = options.inline;

  if (editMode === 'dialog') {
    if (inline !== undefined) {
      throw new EditorConfigurationError(
        'inline options require editMode "inlineDoubleClick".',
      );
    }
    return;
  }

  assertChoice(inline?.blurAction, blurActions, 'blurAction');
  assertChoice(inline?.enterAction, enterActions, 'enterAction');
  assertChoice(inline?.tabAction, tabActions, 'tabAction');
  assertChoice(inline?.updateMode, updateModes, 'updateMode');
  assertClassName(inline?.className);
  assertExplicitMappings(table, options.fields, inline?.columns);

  if (!options.fields.some(isInlineFieldEligible)) {
    throw new EditorConfigurationError(
      'inlineDoubleClick mode requires at least one supported inlineEdit field.',
    );
  }

  if (inline?.updateMode === 'refresh') {
    if (
      options.operations?.update === undefined ||
      options.operations.refresh === undefined
    ) {
      throw new EditorConfigurationError(
        'inline.updateMode "refresh" requires operations.update and operations.refresh.',
      );
    }
  }
}
