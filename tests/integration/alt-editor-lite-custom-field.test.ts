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
  readonly validate?: () => void;
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value);
    },
  };
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
        validate: () => {
          observer.validate?.();
          return readValue().length > options.maximum
            ? {
                message: `Choose no more than ${String(options.maximum)} tags.`,
                valid: false,
              }
            : { valid: true };
        },
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
    expect(observer.contexts[0]?.presentation).toBe('dialog');
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

  it('repopulates a retained Edit from the committed structured value', async () => {
    const records = new Map<string, RecordRow>([
      ['record-a', { id: 'record-a', summary: 'Alpha', tags: ['original'] }],
    ]);
    const observer: TagsObserver = { contexts: [], destroy: vi.fn() };
    const update = vi.fn(
      (
        values: Readonly<Partial<RecordValues>>,
        original: Readonly<RecordRow>,
      ): RecordRow => ({
        ...original,
        tags: [...(values.tags ?? original.tags), 'from-service'],
      }),
    );
    const host = new StandaloneHost<RecordRow, string>({
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
      editing: { dialog: { closeOnSuccess: false, enabled: true } },
      fields: [
        createTagsDefinition(observer).field<RecordValues>({
          label: 'Tags',
          name: 'tags',
          options: { maximum: 4 },
        }),
      ],
      operations: { update },
    });

    await editor.openEditDialog('record-a');
    const control = document.querySelector<HTMLInputElement>('[data-tags-control]');
    const form = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
    if (control === null || form === null) {
      throw new Error('Expected the retained custom field form.');
    }
    control.value = 'client';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();

    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('open');
      expect(control.value).toBe('client, from-service');
    });
    control.value = 'second';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledTimes(2);
      expect(control.value).toBe('second, from-service');
    });

    expect(update.mock.calls[1]?.[1].tags).toEqual(['client', 'from-service']);
    expect(observer.contexts).toHaveLength(1);
    await editor.closeDialog();
    expect(observer.destroy).toHaveBeenCalledOnce();
    expect(observer.contexts[0]?.signal.aborted).toBe(true);
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
    expect(observer.contexts[0]?.presentation).toBe('batch');
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

  it('preserves mixed values through restore and retained multi-record updates', async () => {
    const records = new Map<string, RecordRow>([
      ['record-a', { id: 'record-a', summary: 'A', tags: ['alpha'] }],
      ['record-b', { id: 'record-b', summary: 'B', tags: ['beta'] }],
    ]);
    const validate = vi.fn();
    const observer: TagsObserver = {
      contexts: [],
      destroy: vi.fn(),
      validate,
    };
    const updateMany = vi.fn(
      (
        changes: Readonly<Partial<RecordValues>>,
        originals: readonly Readonly<RecordRow>[],
      ): readonly RecordRow[] =>
        originals.map((original) => ({
          ...original,
          tags:
            changes.tags === undefined ? original.tags : [...changes.tags, original.id],
        })),
    );
    const host = new StandaloneHost<RecordRow, string>({
      applyUpdates: (updates) => {
        for (const { row, target } of updates) {
          records.set(target, row);
        }
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
      editing: { dialog: { closeOnSuccess: false, enabled: true } },
      fields: [
        createTagsDefinition(observer).field<RecordValues>({
          label: 'Tags',
          name: 'tags',
          options: { maximum: 4 },
        }),
      ],
      operations: { updateMany },
    });

    await editor.openBatchEditDialog(['record-a', 'record-b']);
    let field = document.querySelector<HTMLElement>(
      '[data-alteditor-lite-batch-field="tags"]',
    );
    let control = field?.querySelector<HTMLInputElement>('[data-tags-control]');
    let form = document.querySelector<HTMLFormElement>('.alteditor-lite-batch-form');
    if (field === null || control === null || control === undefined || form === null) {
      throw new Error('Expected the retained multi-record custom field form.');
    }
    expect(field.textContent).toContain('Multiple values');
    expect(control.closest<HTMLElement>('.alteditor-lite-field')?.hidden).toBe(true);

    form.requestSubmit();
    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('ready');
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(observer.destroy).toHaveBeenCalledOnce();
    expect(observer.contexts[0]?.signal.aborted).toBe(true);

    await editor.openBatchEditDialog(['record-a', 'record-b']);
    field = document.querySelector<HTMLElement>(
      '[data-alteditor-lite-batch-field="tags"]',
    );
    control = field?.querySelector<HTMLInputElement>('[data-tags-control]');
    form = document.querySelector<HTMLFormElement>('.alteditor-lite-batch-form');
    const setValueButton = field?.querySelector<HTMLButtonElement>(
      '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
    );
    const restoreButton = field?.querySelector<HTMLButtonElement>(
      ':scope > .alteditor-lite-batch-field__action',
    );
    if (field === null || control === null || control === undefined || form === null) {
      throw new Error('Expected the reopened multi-record custom field form.');
    }

    setValueButton?.click();
    control.value = 'temporary';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    restoreButton?.click();
    expect(field.textContent).toContain('Multiple values');
    expect(control.closest<HTMLElement>('.alteditor-lite-field')?.hidden).toBe(true);

    setValueButton?.click();
    control.value = 'shared';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    await vi.waitFor(() => {
      expect(updateMany).toHaveBeenCalledOnce();
      expect(field.textContent).toContain('Multiple values');
      expect(control.closest<HTMLElement>('.alteditor-lite-field')?.hidden).toBe(true);
    });

    expect(updateMany.mock.calls[0]?.[0]).toEqual({ tags: ['shared'] });
    expect([...records.values()].map(({ tags }) => tags)).toEqual([
      ['shared', 'record-a'],
      ['shared', 'record-b'],
    ]);
    expect(validate).toHaveBeenCalledOnce();
    expect(observer.contexts).toHaveLength(2);
    await editor.closeDialog();
    expect(observer.destroy).toHaveBeenCalledTimes(2);
    expect(observer.contexts[1]?.signal.aborted).toBe(true);
  });

  it('does not submit a late asynchronous value after the dialog closes', async () => {
    const pendingValue = createDeferred<readonly string[]>();
    const getValue = vi.fn(() => pendingValue.promise);
    const createRow = vi.fn((values: Readonly<Partial<RecordValues>>): RecordRow => ({
      id: 'created',
      summary: '',
      tags: values.tags ?? [],
    }));
    const applyCreate = vi.fn();
    let context: CustomFieldControllerContext | undefined;
    const definition = defineCustomField<readonly string[]>({
      createController: (_options, controllerContext) => {
        context = controllerContext;
        const control = document.createElement('input');
        return {
          control,
          destroy: vi.fn(),
          focus: () => {
            control.focus();
          },
          getValue,
          setDisabled: (disabled) => {
            control.disabled = disabled;
          },
          setReadOnly: (readOnly) => {
            control.readOnly = readOnly;
          },
          setRequired: (required) => {
            control.required = required;
          },
          setValue: () => undefined,
        };
      },
    });
    const host = new StandaloneHost<RecordRow, string>({
      applyCreate,
      read: () => {
        throw new Error('No records are available.');
      },
    });
    editor = new AltEditorLite(host, {
      clientSide: { createRow },
      fields: [definition.field<RecordValues>({ label: 'Tags', name: 'tags' })],
    });

    await editor.openCreateDialog();
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(getValue).toHaveBeenCalledOnce();
    });

    await editor.closeDialog();
    expect(context?.signal.aborted).toBe(true);
    pendingValue.resolve(['late']);
    await Promise.resolve();
    await Promise.resolve();

    expect(createRow).not.toHaveBeenCalled();
    expect(applyCreate).not.toHaveBeenCalled();
    expect(editor.getState().status).toBe('ready');
  });

  it('releases dialog ownership when custom field cleanup fails', async () => {
    const cleanupFailure = new Error('Custom field cleanup failed.');
    let shouldFailCleanup = true;
    const onError = vi.fn();
    const definition = defineCustomField<readonly string[]>({
      createController: () => {
        const control = document.createElement('input');
        return {
          control,
          destroy: () => {
            if (shouldFailCleanup) {
              shouldFailCleanup = false;
              throw cleanupFailure;
            }
          },
          focus: () => {
            control.focus();
          },
          getValue: () => ['created'],
          setDisabled: (disabled) => {
            control.disabled = disabled;
          },
          setReadOnly: (readOnly) => {
            control.readOnly = readOnly;
          },
          setRequired: (required) => {
            control.required = required;
          },
          setValue: () => undefined,
        };
      },
    });
    const host = new StandaloneHost<RecordRow, string>({
      applyCreate: (row) => row.id,
      read: () => {
        throw new Error('No records are available.');
      },
    });
    editor = new AltEditorLite(host, {
      clientSide: {
        createRow: (values) => ({
          id: 'created',
          summary: '',
          tags: values.tags ?? [],
        }),
      },
      fields: [definition.field<RecordValues>({ label: 'Tags', name: 'tags' })],
      hooks: { onError },
    });

    await editor.openCreateDialog();
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();

    await vi.waitFor(() => {
      expect(editor?.getState().status).toBe('ready');
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: cleanupFailure }),
      expect.objectContaining({ committed: true, operation: 'create' }),
    );
    await expect(editor.openCreateDialog()).resolves.toBeUndefined();
    shouldFailCleanup = true;
    const reopenedField = editor.getField('tags');
    expect(() => {
      reopenedField?.destroy();
    }).toThrow(cleanupFailure);
    expect(editor.getField('tags')).toBeNull();
    await editor.closeDialog();
  });

  it('returns the initialization failure when earlier custom cleanup also fails', async () => {
    const initializationFailure = new Error('Custom field initialization failed.');
    const cleanupFailure = new Error('Custom field cleanup failed.');
    const initializedDefinition = defineCustomField<readonly string[]>({
      createController: () => {
        const control = document.createElement('input');
        return {
          control,
          destroy: () => {
            throw cleanupFailure;
          },
          focus: () => undefined,
          getValue: () => [],
          setDisabled: () => undefined,
          setReadOnly: () => undefined,
          setRequired: () => undefined,
          setValue: () => undefined,
        };
      },
    });
    const failingDefinition = defineCustomField<string>({
      createController: () => {
        throw initializationFailure;
      },
    });
    const host = new StandaloneHost<RecordRow, string>({
      read: () => {
        throw new Error('No records are available.');
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
      fields: [
        initializedDefinition.field<RecordValues>({
          label: 'Tags',
          name: 'tags',
        }),
        failingDefinition.field<RecordValues>({
          label: 'Summary',
          name: 'summary',
        }),
      ],
    });

    await expect(editor.openCreateDialog()).rejects.toBe(initializationFailure);
  });
});
