import { InlineCellHost } from './inline-cell-host.js';

import type { InlineEditView, InlineEditViewHandlers } from './inline-edit-view.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** Values needed to create one compact inline view. */
export interface InlineEditViewContext<TFormValues extends object> {
  readonly className?: string;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly field: Readonly<FieldConfig<TFormValues>>;
  readonly fieldId: string;
  readonly tableElement: HTMLTableElement;
}

/** Creates a replaceable inline editing view. */
export interface InlineEditViewFactory<TFormValues extends object> {
  create(
    context: Readonly<InlineEditViewContext<TFormValues>>,
    handlers: Readonly<InlineEditViewHandlers>,
  ): InlineEditView;
}

/** Creates the built-in compact control-only inline view. */
export class BareInlineEditViewFactory<
  TFormValues extends object,
> implements InlineEditViewFactory<TFormValues> {
  public create(
    context: Readonly<InlineEditViewContext<TFormValues>>,
    handlers: Readonly<InlineEditViewHandlers>,
  ): InlineEditView {
    return new InlineCellHost(
      context.controller,
      context.field,
      context.tableElement,
      handlers,
      context.className,
    );
  }
}
