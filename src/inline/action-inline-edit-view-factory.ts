import { ActionInlineEditView } from './action-inline-edit-view.js';
import { InlineCellHost } from './inline-cell-host.js';

import type {
  InlineEditViewContext,
  InlineEditViewFactory,
} from './inline-edit-view-factory.js';
import type { InlineEditView, InlineEditViewHandlers } from './inline-edit-view.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/** Creates an inline view with dedicated submit and cancel buttons. */
export class ActionInlineEditViewFactory<
  TFormValues extends object,
> implements InlineEditViewFactory<TFormValues> {
  public constructor(private readonly language: Readonly<AltEditorLiteLanguage>) {}

  public create(
    context: Readonly<InlineEditViewContext<TFormValues>>,
    handlers: Readonly<InlineEditViewHandlers>,
  ): InlineEditView {
    const host = new InlineCellHost(
      context.controller,
      context.field,
      context.tableElement,
      context.className,
    );
    return new ActionInlineEditView(
      host,
      handlers,
      this.language.actions.submit,
      this.language.actions.cancel,
    );
  }
}
