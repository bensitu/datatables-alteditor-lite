import { resolveFieldValueComparator } from '../fields/field-value-comparator.js';
import { parseFieldPath } from '../object-path/field-path.js';
import { lookupPathSegments } from '../object-path/get-path-value.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { EditorValues } from './editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { HostRowCollectionCapability } from '../host/editor-host.js';

interface UniqueFieldLookup {
  readonly isEqual: (left: unknown, right: unknown) => boolean;
  readonly name: string;
  readonly pathSegments: readonly string[];
}

interface UniqueValidationExclusion<TRow extends object, TTarget> {
  readonly row?: TRow;
  readonly target?: TTarget;
}

/** Performs host-scoped uniqueness checks for configured field paths. */
export class LocalUniquenessValidator<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  private readonly fields: readonly UniqueFieldLookup[];

  public constructor(
    private readonly collection: HostRowCollectionCapability<TRow, TTarget>,
    fieldConfigurations: readonly FieldConfig<TFormValues>[],
    private readonly language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.fields = Object.freeze(
      fieldConfigurations
        .filter((field) => field.unique === true)
        .map((field) => ({
          isEqual: resolveFieldValueComparator(field),
          name: field.name,
          pathSegments: parseFieldPath(field.name),
        })),
    );
  }

  /** Returns messages for values duplicated by another loaded row. */
  public validate(
    values: Readonly<EditorValues<TFormValues>>,
    exclusion?: Readonly<UniqueValidationExclusion<TRow, TTarget>>,
  ): Readonly<Record<string, string>> {
    const fieldErrors: Record<string, string> = {};
    const candidates: (readonly [UniqueFieldLookup, unknown])[] = [];
    for (const field of this.fields) {
      const value = lookupPathSegments(values, field.pathSegments).value;
      if (value !== undefined) {
        candidates.push([field, value]);
      }
    }
    if (candidates.length === 0) {
      return fieldErrors;
    }

    for (const { row, target } of this.collection.entries()) {
      if (
        (exclusion?.target !== undefined && Object.is(target, exclusion.target)) ||
        (exclusion?.row !== undefined && Object.is(row, exclusion.row))
      ) {
        continue;
      }

      for (const [candidate, value] of candidates) {
        if (
          fieldErrors[candidate.name] === undefined &&
          candidate.isEqual(lookupPathSegments(row, candidate.pathSegments).value, value)
        ) {
          fieldErrors[candidate.name] = this.language.validation.unique;
        }
      }
    }

    return fieldErrors;
  }
}
