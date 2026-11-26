import { parseFieldPath } from '../object-path/field-path.js';
import { lookupPathSegments } from '../object-path/get-path-value.js';

import { resolveFieldValueComparator } from './field-value-comparator.js';
import { hasOwn } from './has-own.js';

import type { FieldConfig } from '../contracts/field-config.js';
import type { HostRowCollectionCapability } from '../host/editor-host.js';
import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { EditorValues } from './editor-values.js';

interface UniqueFieldLookup {
  readonly ignoresBlankText: boolean;
  readonly isEqual: (left: unknown, right: unknown) => boolean;
  readonly name: string;
  readonly pathSegments: readonly string[];
}

export const READ_LOADED_ROWS = Symbol('readLoadedRows');

interface UniqueRowCollection<
  TRow extends object,
  TTarget,
> extends HostRowCollectionCapability<TRow, TTarget> {
  [READ_LOADED_ROWS]?(
    exclusion?: Readonly<{ target: TTarget }>,
  ): Iterable<TRow> | undefined;
}

/** Performs host-scoped uniqueness checks for configured field paths. */
export class LocalUniquenessValidator<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  private readonly fields: readonly UniqueFieldLookup[];

  public constructor(
    private readonly collection: UniqueRowCollection<TRow, TTarget>,
    fieldConfigurations: readonly FieldConfig<TFormValues>[],
    private readonly language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.fields = Object.freeze(
      fieldConfigurations
        .filter((field) => field.unique === true)
        .map((field) => ({
          ignoresBlankText:
            /^(text|email|password|textarea|date|time|datetime-local)$/u.test(field.type),
          isEqual: resolveFieldValueComparator(field),
          name: field.name,
          pathSegments: parseFieldPath(field.name),
        })),
    );
  }

  /** Returns messages for values duplicated by another loaded row. */
  public validate(
    values: Readonly<EditorValues<TFormValues>>,
    exclusion?: Readonly<{ target: TTarget }>,
  ): Readonly<Record<string, string>> {
    const fieldErrors: Record<string, string> = {};
    const candidates: (readonly [UniqueFieldLookup, unknown])[] = [];
    for (const field of this.fields) {
      const value = lookupPathSegments(values, field.pathSegments).value;
      if (
        value !== undefined &&
        !(field.ignoresBlankText && typeof value === 'string' && value.trim() === '')
      ) {
        candidates.push([field, value]);
      }
    }
    if (candidates.length === 0) {
      return fieldErrors;
    }

    const rows = candidates.every(
      ([field, value]) =>
        field.pathSegments.length === 1 &&
        field.isEqual === Object.is &&
        (value === null || (typeof value !== 'object' && typeof value !== 'function')),
    )
      ? this.collection[READ_LOADED_ROWS]?.(exclusion)
      : undefined;

    let remaining = candidates.length;
    for (const row of rows ?? this.readSnapshots(exclusion)) {
      for (const [candidate, value] of candidates) {
        if (hasOwn(fieldErrors, candidate.name)) continue;
        const existing =
          rows === undefined
            ? lookupPathSegments(row, candidate.pathSegments).value
            : readOwnRowValue(row, candidate.name);
        if (candidate.isEqual(existing, value)) {
          fieldErrors[candidate.name] = this.language.validation.unique;
          remaining -= 1;
        }
      }
      if (remaining === 0) break;
    }

    return fieldErrors;
  }

  private *readSnapshots(
    exclusion?: Readonly<{ target: TTarget }>,
  ): Iterable<Readonly<TRow>> {
    for (const { row, target } of this.collection.entries()) {
      if (exclusion === undefined || !Object.is(target, exclusion.target)) yield row;
    }
  }
}

function readOwnRowValue(row: object, name: string): unknown {
  return Object.getOwnPropertyDescriptor(row, name)?.enumerable === true ||
    (name === 'length' && Array.isArray(row))
    ? Reflect.get(row, name)
    : undefined;
}
