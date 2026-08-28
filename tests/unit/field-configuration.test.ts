import { describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { defineCustomField } from '../../src/fields/custom-field.js';
import {
  applyAllowedFieldAttributes,
  assertAllowedFieldAttributes,
} from '../../src/fields/field-attributes.js';
import { validateFieldConfigurations } from '../../src/fields/validate-field-configurations.js';

import type { FieldConfig } from '../../src/fields/field-config.js';

interface ConfigurationValues {
  readonly attachment: File | null;
  readonly choice?: string;
  readonly encodedAttachments: readonly string[];
  readonly notes: string;
  readonly secret: string;
  readonly title: string;
  readonly tags: readonly string[];
}

function expectInvalidField(config: unknown): void {
  expect(() => {
    validateFieldConfigurations([config as FieldConfig<ConfigurationValues>]);
  }).toThrow(EditorConfigurationError);
}

describe('field runtime configuration', () => {
  it('accepts a representative valid field collection', () => {
    expect(() => {
      validateFieldConfigurations<ConfigurationValues>([
        {
          attributes: { autocomplete: 'off', placeholder: 'Title' },
          label: 'Title',
          name: 'title',
          type: 'text',
        },
        { defaultValue: 'token', name: 'secret', type: 'hidden' },
        { label: 'Notes', name: 'notes', rows: 3, type: 'textarea' },
        {
          label: 'Choice',
          name: 'choice',
          options: [{ label: 'First', value: 'first' }],
          type: 'select',
        },
        {
          label: 'Attachment',
          maxFileBytes: 1024,
          name: 'attachment',
          type: 'file',
        },
        {
          encoding: 'data-url',
          label: 'Encoded attachments',
          maxFileBytes: null,
          maxFileCount: null,
          multiple: true,
          name: 'encodedAttachments',
          type: 'file',
        },
      ]);
    }).not.toThrow();
  });

  it('rejects duplicate paths and invalid visible or hidden labels', () => {
    expect(() => {
      validateFieldConfigurations<ConfigurationValues>([
        { label: 'Title', name: 'title', type: 'text' },
        { label: 'Duplicate', name: 'title', type: 'text' },
      ]);
    }).toThrow(EditorConfigurationError);
    expectInvalidField({ label: 'Not allowed', name: 'secret', type: 'hidden' });
    expectInvalidField({ label: '  ', name: 'title', type: 'text' });
    expectInvalidField({ name: 'title', type: 'text' });
  });

  it('rejects unsupported runtime field types with a configuration error', () => {
    expect(() => {
      validateFieldConfigurations([
        { label: 'Title', name: 'title', type: 'unsupported' } as never,
      ]);
    }).toThrow('Unsupported field type "unsupported".');
  });

  it('validates custom definitions and keeps control attributes adapter-owned', () => {
    const definition = defineCustomField<readonly string[]>({
      capabilities: { batch: true },
      createController: () => {
        throw new Error('Not rendered by this test.');
      },
    });
    expect(() => {
      validateFieldConfigurations([
        definition.field<ConfigurationValues>({ label: 'Tags', name: 'tags' }),
      ]);
    }).not.toThrow();
    expectInvalidField({
      definition: { capabilities: { batch: 'yes' }, createController: () => ({}) },
      label: 'Tags',
      name: 'tags',
      type: 'custom',
    });
    expectInvalidField({
      attributes: { placeholder: 'Tags' },
      definition: { createController: () => ({}) },
      label: 'Tags',
      name: 'tags',
      type: 'custom',
    });
  });

  it('rejects empty choice lists for native select and radio fields', () => {
    expectInvalidField({ label: 'Choice', name: 'choice', options: [], type: 'select' });
    expectInvalidField({ label: 'Choice', name: 'choice', options: [], type: 'radio' });
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects invalid file byte limit %s',
    (maxFileBytes) => {
      expectInvalidField({
        label: 'Attachment',
        maxFileBytes,
        name: 'attachment',
        type: 'file',
      });
    },
  );

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid multiple-file count limit %s',
    (maxFileCount) => {
      expectInvalidField({
        label: 'Attachment',
        maxFileCount,
        multiple: true,
        name: 'attachment',
        type: 'file',
      });
    },
  );

  it.each([0, -1, 1.5])('rejects invalid textarea row count %s', (rows) => {
    expectInvalidField({ label: 'Notes', name: 'notes', rows, type: 'textarea' });
  });

  it('rejects default values that cannot be represented by their fields', () => {
    expectInvalidField({ defaultValue: 1, label: 'Title', name: 'title', type: 'text' });
    expectInvalidField({
      defaultValue: 'missing',
      label: 'Choice',
      name: 'choice',
      options: [{ label: 'First', value: 'first' }],
      type: 'select',
    });
    expectInvalidField({
      defaultValue: new File(['data'], 'example.txt'),
      label: 'Attachment',
      name: 'attachment',
      type: 'file',
    });
  });
});

describe('field attribute allowlist', () => {
  it('applies allowlisted attributes case-insensitively', () => {
    const inputElement = document.createElement('input');

    applyAllowedFieldAttributes(inputElement, {
      'ARIA-LABEL': 'Title',
      placeholder: 'Enter a title',
    });

    expect(inputElement.getAttribute('aria-label')).toBe('Title');
    expect(inputElement.placeholder).toBe('Enter a title');
    expect(() => {
      assertAllowedFieldAttributes(undefined, 'text');
    }).not.toThrow();
  });

  it('rejects event handlers, unrelated attributes, and invalid control attributes', () => {
    expect(() => {
      assertAllowedFieldAttributes({ onclick: 'run()' }, 'text');
    }).toThrow(EditorConfigurationError);
    expect(() => {
      assertAllowedFieldAttributes({ style: 'display:none' }, 'text');
    }).toThrow(EditorConfigurationError);
    expect(() => {
      assertAllowedFieldAttributes({ placeholder: 'Not applicable' }, 'radio');
    }).toThrow(EditorConfigurationError);
  });
});
