import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { defineCustomField } from '../../src/fields/custom-field.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import { installDialogElementSupport } from './standalone-test-fixture.js';

import type { CustomFieldControllerContext } from '../../src/fields/custom-field.js';
import type { HostBatchUpdate } from '../../src/host/editor-host.js';

interface RecordRow {
  readonly id: string;
  readonly summary: string;
  readonly tags: readonly string[];
}

interface RecordValues {
  readonly summary: string;
  readonly tags: readonly string[];
}

interface TagsOptions {
  readonly maximum: number;
}

interface TagsObserver {
  readonly destroy: () => void;
  readonly contexts: CustomFieldControllerContext[];
}

function createTagsDefinition(observer: TagsObserver) {
  return defineCustomField<readonly string[], TagsOptions>({
    capabilities: { batch: true, inline: true },
    createController: (options, context) => {
      observer.contexts.push(context);
      const control = document.createElement('input');
      control.type = 'text';
      control.dataset['tagsControl'] = '';
      const readValue = (): readonly string[] =>
        control.value
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
      const handleInput = (): void => {
        context.onUserChange();
      };
      control.addEventListener('input', handleInput);
      return {
        control,
        destroy: () => {
          control.removeEventListener('input', handleInput);
          observer.destroy();
        },
        focus: () => {
          control.focus();
        },
        getValue: readValue,
        setDisabled: (disabled) => {
          control.disabled = disabled;
        },
        setReadOnly: (readOnly) => {
          control.readOnly = readOnly;
        },
        setRequired: (required) => {
          control.required = required;
        },
        setValue: (value) => {
          control.value = value.join(', ');
        },
        validate: () =>
          readValue().length > options.maximum
            ? {
                message: `Choose no more than ${String(options.maximum)} tags.`,
                valid: false,
              }
            : { valid: true },
      };
    },
    isEqual: (left, right) =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]),
  });
}

describe('AltEditorLite custom fields', () => {
  let editor: AltEditorLite<RecordRow, RecordValues, string> | undefined;
  let restoreDialogElement: () => void;

  beforeAll(() => {
    restoreDialogElement = installDialogElementSupport();
  });

  afterAll(() => {
    restoreDialogElement();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.replaceChildren();
  });

  it('supports dialog creation, editing, dependencies, validation, and cleanup', async () => {
    const records = new Map<string, RecordRow>([
      ['record-a', { id: 'record-a', summary: 'Alpha', tags: ['existing'] }],
    ]);
    const observer: TagsObserver = { contexts: [], destroy: vi.fn() };
    const onChange = vi.fn();
    const tagsDefinition = createTagsDefinition(observer);
    const template = document.createElement('template');
    template.innerHTML = `
      <section data-custom-layout>
        <div data-alteditor-lite-field="tags"></div>
        <div data-alteditor-lite-field="summary"></div>
      </section>
    `;
    const host = new StandaloneHost<RecordRow, string>({
      applyCreate: (row) => {
        records.set(row.id, row);
        return row.id;
      },
      applyUpdate: (target, row) => {
        records.set(target, row);
        return target;
      },
      read: (target) => {
        const row = records.get(target);
        if (row === undefined) {
          throw new Error('Record unavailable.');
        }
        return row;
      },
    });
    editor = new AltEditorLite(host, {
      clientSide: {
        createRow: (values) => ({
          id: 'created',
          summary: values.summary ?? '',
          tags: values.tags ?? [],
        }),
      },
      dependencies: {
        tags: (tags) => ({ summary: { value: tags.join(' / ') } }),
      },
      editing: { dialog: { template } },
      fields: [
        tagsDefinition.field<RecordValues>({
          defaultValue: ['initial'],
          description: 'Comma-separated labels.',
          label: 'Tags',
          name: 'tags',
          onChange,
          options: { maximum: 2 },
          required: true,
          validate: (value) =>
            value.includes('blocked')
              ? { message: 'Remove the blocked tag.', valid: false }
              : { valid: true },
        }),
        { label: 'Summary', name: 'summary', type: 'text' },
      ],
      language: { locale: 'ja-JP' },
      validateForm: (values) =>
        values.tags?.includes('form') === true
          ? {
              fieldErrors: { tags: 'Choose a different tag.' },
              valid: false,
            }
          : { valid: true },
    });

    await editor.openCreateDialog();
    const control = document.querySelector<HTMLInputElement>('[data-tags-control]');
    const form = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
    expect(control?.value).toBe('initial');
    expect(control?.closest('[data-alteditor-lite-field="tags"]')).not.toBeNull();
    expect(observer.contexts[0]?.language.locale).toBe('ja-JP');
    editor.getField('tags')?.focus();
    expect(document.activeElement).toBe(control);

    if (control === null || form === null) {
      throw new Error('Expected the custom field form.');
    }
    control.value = 'one, two, three';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(
      document.querySelector<HTMLInputElement>('[data-field-name="summary"] input')
        ?.value,
    ).toBe('one / two / three');
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(control.getAttribute('aria-invalid')).toBe('true');
    });
    expect(control.getAttribute('aria-describedby')).toContain('-error');

    control.value = 'blocked';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(
        control
          .closest('.alteditor-lite-field')
          ?.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('Remove the blocked tag.');
    });

    control.value = 'form';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(
        control
          .closest('.alteditor-lite-field')
          ?.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('Choose a different tag.');
    });

    control.value = 'one, two';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('ready');
    });
    expect(records.get('created')).toEqual({
      id: 'created',
      summary: 'one / two',
      tags: ['one', 'two'],
    });
    expect(observer.contexts[0]?.signal.aborted).toBe(true);

    await editor.openEditDialog('record-a');
    expect(document.querySelector<HTMLInputElement>('[data-tags-control]')?.value).toBe(
      'existing',
    );
    await editor.closeDialog();
    expect(observer.destroy).toHaveBeenCalledTimes(2);
    expect(observer.contexts[1]?.signal.aborted).toBe(true);
  });

  it('uses structural equality and the existing multi-record transaction', async () => {
    const records = new Map<string, RecordRow>([
      ['record-a', { id: 'record-a', summary: 'A', tags: ['shared'] }],
      ['record-b', { id: 'record-b', summary: 'B', tags: ['shared'] }],
    ]);
    const observer: TagsObserver = { contexts: [], destroy: vi.fn() };
    const applyUpdates = vi.fn(
      (updates: readonly Readonly<HostBatchUpdate<RecordRow, string>>[]) => {
        for (const { row, target } of updates) {
          records.set(target, row);
        }
      },
    );
    const host = new StandaloneHost<RecordRow, string>({
      applyUpdates,
      read: (target) => {
        const row = records.get(target);
        if (row === undefined) {
          throw new Error('Record unavailable.');
        }
        return row;
      },
    });
    editor = new AltEditorLite(host, {
      fields: [
        createTagsDefinition(observer).field<RecordValues>({
          label: 'Tags',
          name: 'tags',
          options: { maximum: 3 },
        }),
      ],
    });

    await editor.openBatchEditDialog(['record-a', 'record-b']);
    const control = document.querySelector<HTMLInputElement>('[data-tags-control]');
    expect(control?.value).toBe('shared');
    expect(
      document.querySelector<HTMLElement>(
        '[data-alteditor-lite-batch-field="tags"] .alteditor-lite-batch-field__state',
      )?.hidden,
    ).toBe(true);
    if (control === null) {
      throw new Error('Expected the custom multi-record control.');
    }
    control.value = 'updated';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector<HTMLFormElement>('.alteditor-lite-batch-form')
      ?.requestSubmit();

    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('ready');
    });
    expect([...records.values()].map(({ tags }) => tags)).toEqual([
      ['updated'],
      ['updated'],
    ]);
    expect(applyUpdates).toHaveBeenCalledOnce();
  });
});
