import { ActionInlineEditViewFactory } from './action-inline-edit-view-factory.js';
import { InlineDoubleClickActivation } from './inline-double-click-activation.js';
import { BareInlineEditViewFactory } from './inline-edit-view-factory.js';
import { InlineHoverActivation } from './inline-hover-activation.js';
import { InlineHoverTrigger } from './inline-hover-trigger.js';
import {
  createDoubleClickInteractionBehavior,
  INLINE_HOVER_INTERACTION_BEHAVIOR,
  type ResolvedInlineInteractionBehavior,
} from './inline-interaction-behavior.js';

import type { InlineActivationStrategy } from './inline-activation-strategy.js';
import type { ResolvedInlineEditorOptions } from './inline-edit-options.js';
import type { InlineEditViewFactory } from './inline-edit-view-factory.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditMode } from '../core/edit-mode.js';

/** How an active inline session interacts with another editor operation. */
export type InlineConflictPolicy =
  'cancel-before-operation' | 'require-explicit-resolution';

/** Mode-owned activation, view, interaction, and conflict behavior. */
export interface InlineEditPresentation<TRow extends object, TFormValues extends object> {
  readonly activationStrategy: InlineActivationStrategy<TRow, TFormValues>;
  readonly conflictPolicy: InlineConflictPolicy;
  readonly interactionBehavior: Readonly<ResolvedInlineInteractionBehavior>;
  readonly viewFactory: InlineEditViewFactory<TFormValues>;
}

/** Composes a complete inline presentation only for implemented edit modes. */
export function createInlineEditPresentation<
  TRow extends object,
  TFormValues extends object,
>(
  editMode: EditMode,
  options: Readonly<ResolvedInlineEditorOptions<TFormValues>>,
  language: Readonly<AltEditorLiteLanguage>,
): Readonly<InlineEditPresentation<TRow, TFormValues>> {
  if (editMode === 'inlineHover') {
    const trigger = new InlineHoverTrigger(language.inline.editCell);
    return Object.freeze({
      activationStrategy: new InlineHoverActivation<TRow, TFormValues>(trigger),
      conflictPolicy: 'require-explicit-resolution',
      interactionBehavior: INLINE_HOVER_INTERACTION_BEHAVIOR,
      viewFactory: new ActionInlineEditViewFactory<TFormValues>(language),
    });
  }

  return Object.freeze({
    activationStrategy: new InlineDoubleClickActivation<TRow, TFormValues>(),
    conflictPolicy: 'cancel-before-operation',
    interactionBehavior: createDoubleClickInteractionBehavior(options),
    viewFactory: new BareInlineEditViewFactory<TFormValues>(),
  });
}
