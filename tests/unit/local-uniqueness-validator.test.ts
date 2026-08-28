import { describe, expect, it } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { LocalUniquenessValidator } from '../../src/core/local-uniqueness-validator.js';
import { defineCustomField } from '../../src/fields/custom-field.js';

import type { FieldConfig } from '../../src/fields/field-config.js';
import type { HostRecordEntry } from '../../src/host/editor-host.js';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
  readonly tags: readonly string[];
}

interface Values {
  readonly name: string;
  readonly rank: number;
  readonly tags: readonly string[];
}

function collection(rows: readonly Row[]) {
  return {
    entries: (): Iterable<Readonly<HostRecordEntry<Row, string>>> =>
      rows.map((row) => ({ row, target: row.id })),
  };
}

describe('LocalUniquenessValidator', () => {
  it('uses custom field equality for structured values', () => {
    const tags = defineCustomField<readonly string[]>({
      createController: () => {
        throw new Error('A controller is not needed for value comparison.');
      },
      isEqual: (left, right) =>
        left.length === right.length &&
        left.every((value, index) => value === right[index]),
    });
    const validator = new LocalUniquenessValidator(
      collection([{ id: 'row-a', name: 'Alpha', rank: 1, tags: ['one', 'two'] }]),
      [
        tags.field<Values>({
          label: 'Tags',
          name: 'tags',
          unique: true,
        }),
      ],
      ENGLISH_LANGUAGE,
    );

    expect(validator.validate({ tags: ['one', 'two'] })).toEqual({
      tags: ENGLISH_LANGUAGE.validation.unique,
    });
    expect(validator.validate({ tags: ['two', 'one'] })).toEqual({});
  });

  it('retains identity equality for built-in field values', () => {
    const fields = [
      { label: 'Name', name: 'name', type: 'text', unique: true },
      { label: 'Rank', name: 'rank', type: 'number', unique: true },
    ] satisfies readonly FieldConfig<Values>[];
    const validator = new LocalUniquenessValidator(
      collection([{ id: 'row-a', name: 'Alpha', rank: 1, tags: [] }]),
      fields,
      ENGLISH_LANGUAGE,
    );

    expect(validator.validate({ name: 'Alpha', rank: 2 })).toEqual({
      name: ENGLISH_LANGUAGE.validation.unique,
    });
    expect(validator.validate({ name: 'Beta', rank: 1 })).toEqual({
      rank: ENGLISH_LANGUAGE.validation.unique,
    });
  });
});
