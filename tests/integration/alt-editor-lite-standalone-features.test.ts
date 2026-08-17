import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { isChoiceFieldController } from '../../src/fields/field-controller.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import { installDialogElementSupport } from './standalone-test-fixture.js';

import type { EditorValues } from '../../src/core/editor-values.js';

interface FeatureRecord {
  readonly id: string;
  readonly name: string;
  readonly reviewer: string;
  readonly role: string;
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
});
