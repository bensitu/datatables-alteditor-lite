import { parseFieldPath } from '../object-path/field-path.js';
import { lookupPathSegments } from '../object-path/get-path-value.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { EditorValues } from './editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { HostRowCollectionCapability } from '../host/editor-host.js';

interface UniqueFieldLookup {
  readonly name: string;
  readonly pathSegments: readonly string[];
}

/** Performs host-scoped uniqueness checks for configured field paths. */
export class LocalUniquenessValidator<TRow extends object, TFormValues extends object> {
  private readonly fields: readonly UniqueFieldLookup[];

  public constructor(
    private readonly collection: HostRowCollectionCapability<TRow, unknown>,
    fieldConfigurations: readonly FieldConfig<TFormValues>[],
    private readonly language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.fields = Object.freeze(
      fieldConfigurations
        .filter((field) => field.unique === true)
        .map((field) => ({
          name: field.name,
          pathSegments: parseFieldPath(field.name),
        })),
    );
  }

  /** Returns messages for values duplicated by another loaded row. */
  public validate(
    values: Readonly<EditorValues<TFormValues>>,
    excludedRow?: TRow,
  ): Readonly<Record<string, string>> {
    const fieldErrors: Record<string, string> = {};
    const candidates = this.fields.flatMap((field) => {
      const value = lookupPathSegments(values, field.pathSegments).value;
      return value === undefined ? [] : [{ ...field, value }];
    });

    for (const { row } of this.collection.entries()) {
      if (row === excludedRow) {
        continue;
      }

      for (const candidate of candidates) {
        if (
          fieldErrors[candidate.name] === undefined &&
          Object.is(
            lookupPathSegments(row, candidate.pathSegments).value,
            candidate.value,
          )
        ) {
          fieldErrors[candidate.name] = this.language.validation.unique;
        }
      }
    }

    return fieldErrors;
  }
}
