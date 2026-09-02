import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { defineCustomField } from '../../src/fields/custom-field.js';
import { isChoiceFieldController } from '../../src/fields/field-controller.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import { installDialogElementSupport } from './standalone-test-fixture.js';

import type { EditorValues } from '../../src/core/editor-values.js';
import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { EditorHost } from '../../src/host/editor-host.js';

interface FeatureRecord {
  readonly id: string;
  readonly name: string;
  readonly reviewer: string;
  readonly role: string;
}

interface PendingValidation {
  readonly signal: AbortSignal;
  resolve(result: FieldValidationResult): void;
}

type FeatureValues = Omit<FeatureRecord, 'id'>;

function submitForm(): void {
  const form = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
  if (form === null) {
    throw new Error('Expected an open Standalone feature form.');
  }
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

describe('AltEditorLite Standalone editor features', () => {
  let restoreDialogElement: () => void;

  beforeAll(() => {
    restoreDialogElement = installDialogElementSupport();
  });

  afterAll(() => {
    restoreDialogElement();
    document.body.replaceChildren();
  });

  it('reuses validation, dependencies, choice fields, templates, localization, hooks, and events', async () => {
    const template = document.createElement('template');
    template.id = 'standalone-feature-layout';
    template.innerHTML = `
      <section class="standalone-feature-layout">
        <div data-alteditor-lite-field="name"></div>
        <div data-alteditor-lite-field="role"></div>
        <div data-alteditor-lite-field="reviewer"></div>
      </section>
    `;
    document.body.append(template);
    let record: FeatureRecord = {
      id: 'feature-record',
      name: 'Alpha',
      reviewer: 'reviewer-a',
      role: 'reader',
    };
    const eventTarget = new EventTarget();
    const lifecycle: string[] = [];
    const beforeOpen = vi.fn(() => {
      lifecycle.push('beforeOpen');
    });
    const beforeSubmit = vi.fn(() => {
      lifecycle.push('beforeSubmit');
    });
    const afterSuccess = vi.fn(() => {
      lifecycle.push('afterSuccess');
    });
    const host = new StandaloneHost<FeatureRecord, string>({
      applyUpdate: (_target, nextRecord) => {
        lifecycle.push('apply');
        record = nextRecord;
        return 'feature-record';
      },
      eventTarget,
      read: () => record,
    });
    const editor = new AltEditorLite<FeatureRecord, FeatureValues, string>(host, {
      dependencies: {
        name: (name) => ({
          reviewer: {
            options:
              name === 'Beta'
                ? [{ label: 'Reviewer B', value: 'reviewer-b' }]
                : [{ label: 'Reviewer A', value: 'reviewer-a' }],
            value: name === 'Beta' ? 'reviewer-b' : 'reviewer-a',
          },
          role: {
            options:
              name === 'Beta'
                ? [{ label: 'Editor', value: 'editor' }]
                : [{ label: 'Reader', value: 'reader' }],
            value: name === 'Beta' ? 'editor' : 'reader',
          },
        }),
      },
      editing: {
        dialog: { template: '#standalone-feature-layout' },
      },
      fields: [
        { label: 'Name', name: 'name', required: true, type: 'text' },
        {
          label: 'Role',
          name: 'role',
          options: [{ label: 'Reader', value: 'reader' }],
          type: 'select',
        },
        {
          label: 'Reviewer',
          name: 'reviewer',
          options: [{ label: 'Reviewer A', value: 'reviewer-a' }],
          type: 'search-select',
        },
      ],
      hooks: { afterSuccess, beforeOpen, beforeSubmit },
      language: {
        actions: { submit: 'Save record' },
        dialog: { editTitle: 'Edit standalone record' },
      },
      operations: {
        update: (values, original) => {
          lifecycle.push('persist');
          return {
            ...original,
            name: values.name ?? original.name,
            reviewer: values.reviewer ?? original.reviewer,
            role: values.role ?? original.role,
          };
        },
      },
      validateForm: (values: Readonly<EditorValues<FeatureValues>>) =>
        values.name === 'Blocked'
          ? { message: 'Choose an available name.', valid: false }
          : { valid: true },
    });
    eventTarget.addEventListener('alteditor-lite:open', () => {
      lifecycle.push('open');
    });
    eventTarget.addEventListener('alteditor-lite:success', () => {
      lifecycle.push('success');
    });

    await editor.openEditDialog('feature-record');
    expect(document.querySelector('.standalone-feature-layout')).not.toBeNull();
    expect(document.querySelector('.alteditor-lite-dialog__title')?.textContent).toBe(
      'Edit standalone record',
    );
    expect(
      document.querySelector('.alteditor-lite-dialog__button--submit')?.textContent,
    ).toBe('Save record');
    const reviewer = editor.getField('reviewer');
    expect(reviewer === null ? false : isChoiceFieldController(reviewer)).toBe(true);

    editor.getField('name')?.setValue('Blocked');
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
      expect(
        document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
      ).toContain('Choose an available name.');
    });

    editor.getField('name')?.setValue('Beta');
    document
      .querySelector<HTMLInputElement>('.alteditor-lite-form input')
      ?.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(async () => {
      await expect(editor.getField('role')?.getValue()).resolves.toBe('editor');
      await expect(editor.getField('reviewer')?.getValue()).resolves.toBe('reviewer-b');
    });
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });

    expect(record).toMatchObject({
      name: 'Beta',
      reviewer: 'reviewer-b',
      role: 'editor',
    });
    expect(lifecycle).toEqual([
      'beforeOpen',
      'open',
      'beforeSubmit',
      'persist',
      'apply',
      'success',
      'afterSuccess',
    ]);
    editor.destroy();
  });

  it('applies Create initial values before dependency initialization', async () => {
    const initialValues = Object.freeze({ name: 'Beta' });
    const dirtyStates: boolean[] = [];
    const host = new StandaloneHost<FeatureRecord, string>({
      applyCreate: () => 'created',
      eventTarget: new EventTarget(),
      read: () => ({
        id: 'created',
        name: 'Beta',
        reviewer: 'reviewer-b',
        role: 'editor',
      }),
    });
    const editor = new AltEditorLite<FeatureRecord, FeatureValues, string>(host, {
      dependencies: {
        name: (name) => ({
          reviewer: { value: name === 'Beta' ? 'reviewer-b' : 'reviewer-a' },
          role: { value: name === 'Beta' ? 'editor' : 'reader' },
        }),
      },
      fields: [
        { defaultValue: 'Default', label: 'Name', name: 'name', type: 'text' },
        {
          defaultValue: 'reader',
          label: 'Role',
          name: 'role',
          options: [
            { label: 'Reader', value: 'reader' },
            { label: 'Editor', value: 'editor' },
          ],
          type: 'select',
        },
        {
          defaultValue: 'reviewer-a',
          label: 'Reviewer',
          name: 'reviewer',
          options: [
            { label: 'Reviewer A', value: 'reviewer-a' },
            { label: 'Reviewer B', value: 'reviewer-b' },
          ],
          type: 'select',
        },
      ],
      hooks: {
        beforeClose: ({ dirty }) => {
          dirtyStates.push(dirty);
        },
      },
      operations: {
        create: (values) => ({
          id: 'created',
          name: values.name ?? '',
          reviewer: values.reviewer ?? '',
          role: values.role ?? '',
        }),
      },
    });

    await editor.openCreateDialog(initialValues);
    await expect(editor.getField('name')?.getValue()).resolves.toBe('Beta');
    await expect(editor.getField('role')?.getValue()).resolves.toBe('editor');
    await expect(editor.getField('reviewer')?.getValue()).resolves.toBe('reviewer-b');
    expect(initialValues).toEqual({ name: 'Beta' });

    await editor.closeDialog();
    expect(dirtyStates).toEqual([false]);
    editor.destroy();
  });

  it('keeps only the current blur or submit validation result', async () => {
    const pendingValidations: PendingValidation[] = [];
    const record: FeatureRecord = {
      id: 'validation-record',
      name: 'Alpha',
      reviewer: 'reviewer-a',
      role: 'reader',
    };
    const host = new StandaloneHost<FeatureRecord, string>({
      eventTarget: new EventTarget(),
      read: () => record,
    });
    const editor = new AltEditorLite<FeatureRecord, FeatureValues, string>(host, {
      fields: [
        {
          label: 'Name',
          name: 'name',
          type: 'text',
          validate: (_value, { signal }) =>
            new Promise<FieldValidationResult>((resolve) => {
              pendingValidations.push({ resolve, signal });
            }),
          validateOn: 'blur',
        },
      ],
    });

    await editor.openEditDialog('validation-record');
    const field = editor.getField('name');
    const input = field?.element.querySelector<HTMLInputElement>('input');
    const outside = document.querySelector<HTMLButtonElement>(
      '.alteditor-lite-dialog__button--cancel',
    );
    if (field === null || input === null || input === undefined || outside === null) {
      throw new Error('Expected an open validation field.');
    }

    input.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    await vi.waitFor(() => {
      expect(pendingValidations).toHaveLength(1);
    });
    expect(field.element.classList.contains('alteditor-lite-field--validating')).toBe(
      true,
    );
    expect(field.element.getAttribute('aria-busy')).toBe('true');

    input.value = 'Beta';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(pendingValidations[0]?.signal.aborted).toBe(true);
    input.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    await vi.waitFor(() => {
      expect(pendingValidations).toHaveLength(2);
    });
    pendingValidations[1]?.resolve({ message: 'Current blur error.', valid: false });
    await vi.waitFor(() => {
      expect(
        field.element.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('Current blur error.');
    });
    pendingValidations[0]?.resolve({ message: 'Stale blur error.', valid: false });
    await Promise.resolve();
    expect(field.element.querySelector('.alteditor-lite-field__error')?.textContent).toBe(
      'Current blur error.',
    );

    input.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    await vi.waitFor(() => {
      expect(pendingValidations).toHaveLength(3);
    });
    document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(pendingValidations).toHaveLength(4);
    });
    expect(pendingValidations[2]?.signal.aborted).toBe(true);
    input.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    pendingValidations[3]?.resolve({ message: 'Submit error.', valid: false });
    await vi.waitFor(() => {
      expect(
        field.element.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('Submit error.');
    });
    expect(pendingValidations).toHaveLength(4);
    pendingValidations[2]?.resolve({ message: 'Late blur error.', valid: false });
    await Promise.resolve();
    expect(field.element.querySelector('.alteditor-lite-field__error')?.textContent).toBe(
      'Submit error.',
    );
    expect(field.element.classList.contains('alteditor-lite-field--validating')).toBe(
      false,
    );
    expect(field.element.hasAttribute('aria-busy')).toBe(false);
    editor.destroy();
  });

  it('honors a custom field focus boundary', async () => {
    const validate = vi.fn(() => ({ valid: true }) as const);
    const portal = document.createElement('button');
    document.body.append(portal);
    const customText = defineCustomField<string>({
      createController: () => {
        const control = document.createElement('div');
        const input = document.createElement('input');
        control.append(input);
        return {
          containsFocusTarget: (target) =>
            (target !== null && control.contains(target)) || target === portal,
          control,
          destroy: () => {
            portal.remove();
          },
          focus: () => {
            input.focus();
          },
          getValue: () => input.value,
          setDisabled: (isDisabled) => {
            input.disabled = isDisabled;
          },
          setReadOnly: (isReadOnly) => {
            input.readOnly = isReadOnly;
          },
          setRequired: (isRequired) => {
            input.required = isRequired;
          },
          setValue: (value) => {
            input.value = value;
          },
        };
      },
    });
    const host = new StandaloneHost<FeatureRecord, string>({
      read: () => ({
        id: 'custom-focus',
        name: 'Alpha',
        reviewer: 'reviewer-a',
        role: 'reader',
      }),
    });
    const editor = new AltEditorLite<FeatureRecord, FeatureValues, string>(host, {
      fields: [
        customText.field<FeatureValues>({
          label: 'Name',
          name: 'name',
          validate,
          validateOn: 'blur',
        }),
      ],
    });

    await editor.openEditDialog('custom-focus');
    const customInput = editor.getField('name')?.element.querySelector('input');
    if (customInput === null || customInput === undefined) {
      throw new Error('Expected an open custom field.');
    }
    customInput.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: portal }),
    );
    await Promise.resolve();
    expect(validate).not.toHaveBeenCalled();

    customInput.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    );
    await vi.waitFor(() => {
      expect(validate).toHaveBeenCalledOnce();
    });
    editor.destroy();
  });

  it('resolves a form template for each dialog operation', async () => {
    const operations: ('create' | 'edit' | 'batchEdit')[] = [];
    const createTemplate = document.createElement('template');
    const editTemplate = document.createElement('template');
    const batchTemplate = document.createElement('template');
    createTemplate.innerHTML =
      '<section class="create-layout"><div data-alteditor-lite-field="name"></div></section>';
    editTemplate.innerHTML =
      '<section class="edit-layout"><div data-alteditor-lite-field="name"></div></section>';
    batchTemplate.innerHTML =
      '<section class="batch-layout"><div data-alteditor-lite-field="name"></div></section>';
    document.body.append(createTemplate, editTemplate, batchTemplate);
    const records = new Map<string, FeatureRecord>([
      [
        'record-a',
        {
          id: 'record-a',
          name: 'Alpha',
          reviewer: 'reviewer-a',
          role: 'reader',
        },
      ],
      [
        'record-b',
        {
          id: 'record-b',
          name: 'Beta',
          reviewer: 'reviewer-b',
          role: 'editor',
        },
      ],
    ]);
    const host = new StandaloneHost<FeatureRecord, string>({
      applyUpdates: () => undefined,
      read: (target) => {
        const record = records.get(target);
        if (record === undefined) {
          throw new Error('The requested template record is unavailable.');
        }
        return record;
      },
    });
    const editor = new AltEditorLite<FeatureRecord, FeatureValues, string>(host, {
      editing: {
        dialog: {
          template: ({ operation }) => {
            operations.push(operation);
            return operation === 'create'
              ? createTemplate
              : operation === 'edit'
                ? editTemplate
                : batchTemplate;
          },
        },
      },
      fields: [{ label: 'Name', name: 'name', type: 'text' }],
      operations: {
        create: (values) => ({
          id: 'created',
          name: values.name ?? '',
          reviewer: 'reviewer-a',
          role: 'reader',
        }),
      },
    });

    await editor.openCreateDialog();
    expect(document.querySelector('.create-layout')).not.toBeNull();
    await editor.closeDialog();
    await editor.openEditDialog('record-a');
    expect(document.querySelector('.edit-layout')).not.toBeNull();
    await editor.closeDialog();
    await editor.openBatchEditDialog(['record-a', 'record-b']);
    expect(document.querySelector('.batch-layout')).not.toBeNull();
    await editor.closeDialog();

    expect(operations).toEqual(['create', 'edit', 'batchEdit']);
    expect(createTemplate.content.querySelector('.alteditor-lite-field')).toBeNull();
    expect(editTemplate.content.querySelector('.alteditor-lite-field')).toBeNull();
    expect(batchTemplate.content.querySelector('.alteditor-lite-field')).toBeNull();
    editor.destroy();
    createTemplate.remove();
    editTemplate.remove();
    batchTemplate.remove();
  });

  it('completes destruction when consumer-owned notification and host cleanup fail', () => {
    const ownershipKey = {};
    const eventFailure = new Error('Notification failed.');
    const hostFailure = new Error('Host cleanup failed.');
    const eventTarget = new EventTarget();
    vi.spyOn(eventTarget, 'dispatchEvent').mockImplementation((event) => {
      if (event.type === 'alteditor-lite:destroy') {
        throw eventFailure;
      }
      return true;
    });
    const hostDestroy = vi.fn(() => {
      throw hostFailure;
    });
    const record: FeatureRecord = {
      id: 'cleanup-record',
      name: 'Cleanup',
      reviewer: 'reviewer-a',
      role: 'reader',
    };
    const host: EditorHost<FeatureRecord, string> = {
      applyCreate: () => Promise.resolve(undefined),
      applyRemove: () => Promise.resolve(),
      applyUpdate: () => Promise.resolve(undefined),
      destroy: hostDestroy,
      eventTarget,
      ownershipKey,
      read: () => record,
    };
    const editor = new AltEditorLite(host, { fields: [] });

    expect(() => {
      editor.destroy();
    }).toThrow(eventFailure);

    expect(hostDestroy).toHaveBeenCalledOnce();
    expect(() => editor.getState()).toThrow();
    expect(document.querySelector('.alteditor-lite-dialog')).toBeNull();

    const replacementEditor = new AltEditorLite(
      { ...host, destroy: () => undefined, eventTarget: new EventTarget() },
      { fields: [] },
    );
    replacementEditor.destroy();
  });
});
