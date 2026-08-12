import { afterEach, describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { buildEditorForm } from '../../src/form/build-editor-form.js';
import { resolveTemplateSource } from '../../src/form/layout/resolve-template-source.js';
import { TemplateFormLayout } from '../../src/form/layout/template-form-layout.js';

import type { FieldConfig } from '../../src/fields/field-config.js';
import type { FormController } from '../../src/form/form-controller.js';

interface LayoutValues {
  readonly notes: string;
  readonly omitted: string;
  readonly profile: {
    readonly name: string;
  };
  readonly token: string;
}

const fields = [
  {
    defaultValue: 'Initial',
    label: 'Name',
    name: 'profile.name',
    type: 'text',
  },
  {
    defaultValue: 'Hidden notes',
    label: 'Notes',
    name: 'notes',
    type: 'text',
    visible: false,
  },
  {
    defaultValue: 'token',
    name: 'token',
    type: 'hidden',
  },
  {
    editable: false,
    label: 'Omitted',
    name: 'omitted',
    type: 'text',
  },
] as const satisfies readonly FieldConfig<LayoutValues>[];

const activeForms: FormController<LayoutValues>[] = [];

afterEach(() => {
  for (const form of activeForms) {
    form.destroy();
  }
  activeForms.length = 0;
  document.body.replaceChildren();
});

function createTemplate(markup: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template;
}

function buildWithTemplate(
  template: HTMLTemplateElement | HTMLElement | string,
): FormController<LayoutValues> {
  const form = buildEditorForm(
    fields,
    'layout-test',
    ENGLISH_LANGUAGE,
    undefined,
    template,
  );
  activeForms.push(form);
  document.body.append(form.element);
  return form;
}

describe('dialog form layouts', () => {
  it('resolves a selector by cloning template content without changing its source', () => {
    const template = createTemplate('<section class="source-content">Layout</section>');
    template.id = 'employee-editor';
    document.body.append(template);

    const clone = resolveTemplateSource('#employee-editor');
    const clonedSection = clone.querySelector('.source-content');

    expect(clonedSection).not.toBeNull();
    expect(clonedSection).not.toBe(template.content.querySelector('.source-content'));
    expect(template.isConnected).toBe(true);
    expect(template.content.querySelector('.source-content')?.textContent).toBe('Layout');
  });

  it('deeply clones an ordinary element without detaching or changing it', () => {
    const source = document.createElement('section');
    source.append(document.createElement('span'));
    document.body.append(source);

    const clone = resolveTemplateSource(source);
    const clonedSection = clone.firstElementChild;

    expect(clonedSection).toBeInstanceOf(HTMLElement);
    expect(clonedSection).not.toBe(source);
    expect(clonedSection?.firstElementChild).not.toBe(source.firstElementChild);
    expect(source.isConnected).toBe(true);
    expect(source.childElementCount).toBe(1);
  });

  it.each([
    ['[', 'valid selector'],
    ['#missing-layout', 'did not match'],
    ['<div>raw html</div>', 'valid selector'],
  ])('rejects an unsupported selector source %s', (source, message) => {
    expect(() => resolveTemplateSource(source)).toThrow(EditorConfigurationError);
    expect(() => resolveTemplateSource(source)).toThrow(message);
  });

  it.each([
    [
      '<div data-alteditor-lite-field="unknown"></div>',
      'does not match an editable field',
    ],
    [
      '<div data-alteditor-lite-field="profile.name"></div><div data-alteditor-lite-field="profile.name"></div><div data-alteditor-lite-field="notes"></div>',
      'more than one slot',
    ],
    [
      '<div data-alteditor-lite-field="profile.name"></div>',
      'missing a slot for "notes"',
    ],
    ['<div data-alteditor-lite-field="profile[0]"></div>', 'Invalid field path'],
    [
      '<form><div data-alteditor-lite-field="profile.name"></div><div data-alteditor-lite-field="notes"></div></form>',
      'cannot contain a form element',
    ],
  ])('rejects an invalid field slot contract', (markup, message) => {
    const template = createTemplate(markup);
    expect(() => new TemplateFormLayout(template, fields, 'layout-invalid')).toThrow(
      EditorConfigurationError,
    );
    expect(() => new TemplateFormLayout(template, fields, 'layout-invalid')).toThrow(
      message,
    );
  });

  it('mounts dot paths, requires visually hidden fields, and allows omitted hidden slots', () => {
    const template = createTemplate(`
      <section class="custom-layout">
        <div data-alteditor-lite-field="notes"></div>
        <div data-alteditor-lite-field="profile.name"></div>
      </section>
    `);
    const form = buildWithTemplate(template);
    const profileSlot = form.element.querySelector<HTMLElement>(
      '[data-alteditor-lite-field="profile.name"]',
    );
    const notesSlot = form.element.querySelector<HTMLElement>(
      '[data-alteditor-lite-field="notes"]',
    );

    expect(profileSlot?.querySelector('[data-field-name="profile.name"]')).not.toBeNull();
    expect(notesSlot?.querySelector('[data-field-name="notes"]')).not.toBeNull();
    expect(notesSlot?.hidden).toBe(true);
    expect(form.getField('token')?.element.isConnected).toBe(true);
    expect(form.getField('token')?.element.parentElement?.hidden).toBe(true);
    expect(form.getField('omitted')).toBeNull();
  });

  it('keeps the configured field order in the built-in layout', () => {
    const form = buildEditorForm(fields, 'default-layout', ENGLISH_LANGUAGE);
    activeForms.push(form);
    document.body.append(form.element);

    expect(
      [...form.element.querySelectorAll<HTMLElement>('[data-field-name]')].map(
        (element) => element.dataset['fieldName'],
      ),
    ).toEqual(['profile.name', 'notes', 'token']);
  });
});
