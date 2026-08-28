import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { createFieldController } from '../fields/create-field-controller.js';
import { INLINE_FIELD_PRESENTATION } from '../fields/field-controller-presentation.js';

import type { InlineEditSession } from './inline-edit-session.js';
import type { InlineEditViewFactory } from './inline-edit-view-factory.js';
import type { InlineTargetCapture } from './inline-target-capture.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { InteractionToken } from '../core/editing/interaction-coordinator.js';
import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';

export interface InlineSessionFactoryArguments<TFormValues extends object> {
  readonly instanceId: string;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly options: Readonly<ResolvedInlineEditingOptions<TFormValues>>;
  readonly tableElement: HTMLTableElement;
  readonly viewFactory: InlineEditViewFactory<TFormValues>;
  readonly onUserChange: () => void;
  readonly onCancel: (reason: 'cancel' | 'escape') => void;
  readonly onSubmit: () => void;
}

export interface InlineSessionFactoryRequest<
  TRow extends object,
  TFormValues extends object,
> {
  readonly capture: InlineTargetCapture<TRow, TFormValues>;
  readonly interactionToken: InteractionToken;
  readonly originalActiveElement: Element | null;
  readonly sessionId: number;
  readonly signal: AbortSignal;
}

/** Creates editor-owned controller, view, and session resources without mounting. */
export class InlineSessionFactory<TFormValues extends object> {
  public constructor(
    private readonly arguments_: InlineSessionFactoryArguments<TFormValues>,
  ) {}

  /** Builds one complete unmounted session or releases partially created resources. */
  public async create<TRow extends object>(
    request: InlineSessionFactoryRequest<TRow, TFormValues>,
  ): Promise<InlineEditSession<TRow, TFormValues>> {
    const { capture, signal } = request;
    const lifecycleAbortController = new AbortController();
    const controller = createFieldController(
      capture.field,
      `${this.arguments_.instanceId}-inline-${String(capture.summary.rowIndex)}-${String(capture.summary.columnIndex)}`,
      this.arguments_.language,
      this.arguments_.onUserChange,
      INLINE_FIELD_PRESENTATION,
      mergeAbortSignals([signal, lifecycleAbortController.signal]),
    );

    try {
      controller.setValue(capture.originalValue);
      const normalizedOriginalValue = await Promise.resolve(controller.getValue(signal));
      signal.throwIfAborted();
      const host = this.arguments_.viewFactory.create(
        {
          ...(this.arguments_.options.className === undefined
            ? {}
            : { className: this.arguments_.options.className }),
          controller,
          field: capture.field,
          tableElement: this.arguments_.tableElement,
        },
        {
          onCancel: this.arguments_.onCancel,
          onSubmit: this.arguments_.onSubmit,
        },
      );

      return {
        capture,
        changeRevision: 0,
        controller,
        host,
        interactionToken: request.interactionToken,
        lifecycleAbortController,
        normalizedOriginalValue,
        originalActiveElement: request.originalActiveElement,
        sessionId: request.sessionId,
      };
    } catch (error: unknown) {
      lifecycleAbortController.abort();
      controller.destroy();
      throw error;
    }
  }
}
