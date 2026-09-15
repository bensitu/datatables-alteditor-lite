import { DefaultFormLayout } from './layout/default-form-layout.js';
import { TemplateFormLayout } from './layout/template-form-layout.js';

import type { DialogTemplateSource } from '../core/editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { FormLayout } from './layout/form-layout.js';

/** Creates the shared form structure without owning field state or validation. */
export function createFormView<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  instanceId: string,
  template: DialogTemplateSource | undefined,
  isBatch = false,
): {
  readonly element: HTMLFormElement;
  readonly layout: FormLayout;
  readonly submissionErrorElement: HTMLDivElement;
} {
  const element = document.createElement('form');
  element.className = isBatch
    ? 'alteditor-lite-form alteditor-lite-batch-form'
    : 'alteditor-lite-form';
  element.id = isBatch ? `${instanceId}-batch-form` : `${instanceId}-form`;
  element.noValidate = true;
  const layout =
    template === undefined
      ? new DefaultFormLayout()
      : new TemplateFormLayout(template, fields, instanceId);
  const submissionErrorElement = document.createElement('div');
  submissionErrorElement.className = 'alteditor-lite-form__submission-error';
  submissionErrorElement.hidden = true;
  submissionErrorElement.setAttribute('role', 'alert');
  element.append(layout.element, submissionErrorElement);
  return { element, layout, submissionErrorElement };
}
