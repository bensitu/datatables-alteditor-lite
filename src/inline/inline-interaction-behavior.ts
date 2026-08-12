import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';

/** Resolved keyboard and focus behavior for one inline presentation. */
export interface ResolvedInlineInteractionBehavior {
  readonly blurAction: 'submit' | 'cancel' | 'none';
  readonly enterAction: 'submit' | 'none';
  readonly escapeAction: 'cancel' | 'none';
  readonly tabAction: 'submit-and-move' | 'submit' | 'none';
}

/** Preserves the compact double-click interaction model. */
export function createDoubleClickInteractionBehavior<TFormValues extends object>(
  options: Readonly<ResolvedInlineEditingOptions<TFormValues>>,
): Readonly<ResolvedInlineInteractionBehavior> {
  return Object.freeze({
    blurAction: options.blurAction,
    enterAction: options.enterAction,
    escapeAction: 'cancel',
    tabAction: options.tabAction,
  });
}

/** Requires the dedicated action buttons to resolve a hover session. */
export const INLINE_HOVER_INTERACTION_BEHAVIOR = Object.freeze({
  blurAction: 'none',
  enterAction: 'none',
  escapeAction: 'none',
  tabAction: 'none',
} as const satisfies ResolvedInlineInteractionBehavior);
