import { EditorConfigurationError } from '../../core/alt-editor-lite-error.js';
import { resolveFieldCapabilities } from '../../fields/field-capabilities.js';
import { parseFieldPath } from '../../object-path/field-path.js';

import {
  createFieldMountPoint,
  type FieldMountPoint,
  type FormLayout,
} from './form-layout.js';
import { resolveTemplateSource } from './resolve-template-source.js';

import type { DialogTemplateSource } from '../../core/editing-options.js';
import type { FieldConfig } from '../../fields/field-config.js';

const FIELD_SLOT_ATTRIBUTE = 'data-alteditor-lite-field';

function assertSafeIdentifiers(element: HTMLElement, instanceId: string): void {
  const cloneIdentifiers = new Set<string>();
  for (const identifiedElement of element.querySelectorAll<HTMLElement>('[id]')) {
    const identifier = identifiedElement.id;
    if (identifier.length === 0) {
      continue;
    }
    if (cloneIdentifiers.has(identifier)) {
      throw new EditorConfigurationError(
        `Dialog form template contains duplicate id "${identifier}".`,
      );
    }
    cloneIdentifiers.add(identifier);
    if (
      document.getElementById(identifier) !== null ||
      identifier === `${instanceId}-form` ||
      identifier.startsWith(`${instanceId}-field-`)
    ) {
      throw new EditorConfigurationError(
        `Dialog form template id "${identifier}" is already in use or reserved.`,
      );
    }
  }
}

/** Places editor-owned fields into cloned consumer-provided slots. */
export class TemplateFormLayout<TFormValues extends object> implements FormLayout {
  public readonly element = document.createElement('div');

  private readonly slotsByFieldName = new Map<string, HTMLElement>();

  private readonly hiddenFieldNames = new Set<string>();

  public constructor(
    source: DialogTemplateSource,
    fields: readonly FieldConfig<TFormValues>[],
    instanceId: string,
  ) {
    this.element.className = 'alteditor-lite-form__layout';
    this.element.append(resolveTemplateSource(source));
    if (this.element.querySelector('form') !== null) {
      throw new EditorConfigurationError(
        'Dialog form templates cannot contain a form element.',
      );
    }
    assertSafeIdentifiers(this.element, instanceId);

    const editableFields = new Map<string, Readonly<FieldConfig<TFormValues>>>(
      fields
        .filter((field) => resolveFieldCapabilities(field).dialog)
        .map((field) => [field.name, field] as const),
    );
    for (const field of editableFields.values()) {
      if (field.type === 'hidden') {
        this.hiddenFieldNames.add(field.name);
      }
    }

    for (const slot of this.element.querySelectorAll(`[${FIELD_SLOT_ATTRIBUTE}]`)) {
      if (!(slot instanceof HTMLElement)) {
        throw new EditorConfigurationError(
          'Dialog form template field slots must be HTML elements.',
        );
      }
      const fieldName = slot.getAttribute(FIELD_SLOT_ATTRIBUTE) ?? '';
      parseFieldPath(fieldName);
      if (!editableFields.has(fieldName)) {
        throw new EditorConfigurationError(
          `Dialog form template slot "${fieldName}" does not match an editable field.`,
        );
      }
      if (this.slotsByFieldName.has(fieldName)) {
        throw new EditorConfigurationError(
          `Dialog form template contains more than one slot for "${fieldName}".`,
        );
      }
      slot.classList.add('alteditor-lite-form__slot');
      this.slotsByFieldName.set(fieldName, slot);
    }

    for (const [fieldName, field] of editableFields) {
      if (field.type !== 'hidden' && !this.slotsByFieldName.has(fieldName)) {
        throw new EditorConfigurationError(
          `Dialog form template is missing a slot for "${fieldName}".`,
        );
      }
    }
  }

  public mountField(fieldName: string, fieldElement: HTMLElement): FieldMountPoint {
    let slotElement = this.slotsByFieldName.get(fieldName);
    if (slotElement === undefined) {
      if (!this.hiddenFieldNames.has(fieldName)) {
        throw new EditorConfigurationError(
          `Dialog form template is missing a slot for "${fieldName}".`,
        );
      }
      slotElement = document.createElement('div');
      slotElement.className = 'alteditor-lite-form__slot';
      this.element.append(slotElement);
      this.slotsByFieldName.set(fieldName, slotElement);
    }

    const mountPoint = createFieldMountPoint(slotElement);
    mountPoint.mount(fieldElement);
    return mountPoint;
  }

  public destroy(): void {
    this.slotsByFieldName.clear();
    this.hiddenFieldNames.clear();
    this.element.replaceChildren();
    this.element.remove();
  }
}
