import { describe, expect, it } from 'vitest';

import { defineCustomField } from '../../src/fields/custom-field.js';
import {
  resolveBatchFieldRestriction,
  resolveFieldCapabilities,
} from '../../src/fields/field-capabilities.js';
import { resolveFieldValueComparator } from '../../src/fields/field-value-comparator.js';

import type { FieldConfig } from '../../src/fields/field-config.js';

interface Values {
  readonly name: string;
  readonly tags: readonly string[];
}

const textField = {
  inlineEdit: true,
  label: 'Name',
  name: 'name',
  type: 'text',
} as const satisfies FieldConfig<Values>;

describe('field capabilities', () => {
  it('preserves built-in dialog, multi-record, and inline behavior', () => {
    expect(resolveFieldCapabilities(textField)).toEqual({
      batch: true,
      dialog: true,
      inline: true,
    });
    expect(resolveFieldCapabilities({ ...textField, batchEditable: false })).toEqual({
      batch: false,
      dialog: true,
      inline: true,
    });
    expect(resolveFieldCapabilities({ ...textField, editable: false })).toEqual({
      batch: false,
      dialog: false,
      inline: false,
    });
    expect(resolveFieldCapabilities({ ...textField, visible: false })).toEqual({
      batch: true,
      dialog: true,
      inline: false,
    });
  });

  it('keeps fixed multi-record restrictions stronger than configuration', () => {
    expect(
      resolveBatchFieldRestriction({
        batchEditable: true,
        label: 'Attachment',
        name: 'name',
        type: 'file',
      }),
    ).toBe('file');
    expect(
      resolveBatchFieldRestriction({ ...textField, batchEditable: true, unique: true }),
    ).toBe('unique');
    expect(resolveBatchFieldRestriction({ ...textField, batchEditable: false })).toBe(
      'disabled-by-config',
    );
  });

  it('requires explicit custom support and uses custom equality', () => {
    const unsupported = defineCustomField<readonly string[]>({
      createController: () => {
        throw new Error('Not rendered by this test.');
      },
    }).field<Values>({ label: 'Tags', name: 'tags' });
    const supported = defineCustomField<readonly string[]>({
      capabilities: { batch: true, inline: true },
      createController: () => {
        throw new Error('Not rendered by this test.');
      },
      isEqual: (left, right) =>
        left.length === right.length &&
        left.every((value, index) => value === right[index]),
    }).field<Values>({ inlineEdit: true, label: 'Tags', name: 'tags' });

    expect(resolveFieldCapabilities(unsupported)).toEqual({
      batch: false,
      dialog: true,
      inline: false,
    });
    expect(resolveBatchFieldRestriction(unsupported)).toBe('unsupported-by-field');
    expect(resolveFieldCapabilities(supported)).toEqual({
      batch: true,
      dialog: true,
      inline: true,
    });
    expect(resolveFieldValueComparator(supported)(['a'], ['a'])).toBe(true);
    expect(resolveFieldValueComparator(supported)(['a'], ['b'])).toBe(false);
    expect(resolveFieldValueComparator(textField)(Number.NaN, Number.NaN)).toBe(true);
  });
});
