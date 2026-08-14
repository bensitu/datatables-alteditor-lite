import { isInlineFieldEligible } from './inline-field-capability.js';

import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api } from 'datatables.net';

/** Exact public DataTables column identity resolved at construction. */
export interface InlineColumnMapping<TFormValues extends object> {
  readonly columnIndex: number;
  readonly columnName?: string;
  readonly dataSrc?: string;
  readonly fieldName: FieldPath<TFormValues>;
}

/** Builds explicit-name mappings followed by exact string data-source mappings. */
export function createInlineColumnMappings<
  TRow extends object,
  TFormValues extends object,
>(
  table: Api<TRow>,
  fields: readonly FieldConfig<TFormValues>[],
  options: Readonly<ResolvedInlineEditingOptions<TFormValues>>,
): ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>> {
  const fieldsByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
    fields.map((field) => [field.name, field]),
  );
  const mappings = new Map<number, Readonly<InlineColumnMapping<TFormValues>>>();

  for (const columnIndex of table.columns().indexes().toArray()) {
    const column = table.column(columnIndex);
    const configuredColumnName = column.name();
    const configuredDataSource = column.dataSrc();
    const columnName =
      typeof configuredColumnName === 'string' && configuredColumnName.length > 0
        ? configuredColumnName
        : undefined;
    const dataSrc =
      typeof configuredDataSource === 'string' ? configuredDataSource : undefined;
    const hasExplicitMapping =
      columnName !== undefined && Object.hasOwn(options.columns, columnName);
    const configuredFieldName = hasExplicitMapping
      ? options.columns[columnName]
      : dataSrc;

    if (configuredFieldName === false || typeof configuredFieldName !== 'string') {
      continue;
    }

    const field = fieldsByName.get(configuredFieldName);
    if (field === undefined || !isInlineFieldEligible(field)) {
      continue;
    }

    mappings.set(
      columnIndex,
      Object.freeze({
        columnIndex,
        fieldName: field.name,
        ...(columnName === undefined ? {} : { columnName }),
        ...(dataSrc === undefined ? {} : { dataSrc }),
      }),
    );
  }

  return mappings;
}
