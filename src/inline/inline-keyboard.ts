import type { ResolvedInlineEditorOptions } from './inline-edit-options.js';
import type { FieldConfig } from '../fields/field-config.js';

/** Action owned by the inline host for one keyboard event. */
export type InlineKeyboardIntent =
  | { readonly type: 'cancel' }
  | { readonly type: 'submit' }
  | {
      readonly direction: 'backward' | 'forward';
      readonly type: 'submit-and-move';
    };

/** Maps a control key to an inline action without mutating the event. */
export function resolveInlineKeyboardIntent<TFormValues extends object>(
  event: KeyboardEvent,
  field: Readonly<FieldConfig<TFormValues>>,
  options: Readonly<ResolvedInlineEditorOptions<TFormValues>>,
): Readonly<InlineKeyboardIntent> | undefined {
  if (event.defaultPrevented || event.isComposing) {
    return undefined;
  }
  if (event.key === 'Escape') {
    return Object.freeze({ type: 'cancel' });
  }
  if (event.key === 'Tab' && options.tabAction !== 'none') {
    return options.tabAction === 'submit-and-move'
      ? Object.freeze({
          direction: event.shiftKey ? 'backward' : 'forward',
          type: 'submit-and-move',
        })
      : Object.freeze({ type: 'submit' });
  }
  if (
    event.key !== 'Enter' ||
    options.enterAction === 'none' ||
    field.type === 'select'
  ) {
    return undefined;
  }
  if (field.type === 'textarea' && !event.ctrlKey && !event.metaKey) {
    return undefined;
  }
  return Object.freeze({ type: 'submit' });
}
