import { resolveInlineKeyboardShortcut } from './inline-keyboard-shortcut.js';

import type { InlineKeyboardShortcut } from './inline-keyboard-shortcut.js';
import type { FieldPath } from '../object-path/field-path.js';

/** Configuration for single-cell inline editing. */
export interface InlineEditorOptions<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The row type keeps option inference aligned with the editor.
  TRow extends object,
  TFormValues extends object,
> {
  readonly blurAction?: 'submit' | 'cancel' | 'none';
  readonly enterAction?: 'submit' | 'none';
  readonly tabAction?: 'submit-and-move' | 'submit' | 'none';
  readonly columns?: Readonly<Record<string, FieldPath<TFormValues> | false>>;
  readonly updateMode?: 'replace-row' | 'refresh';
  readonly className?: string;
  readonly keyboardActivation?: Readonly<InlineKeyboardShortcut> | false;
}

/** Fully resolved inline behavior used by the runtime controller. */
export interface ResolvedInlineEditorOptions<TFormValues extends object> {
  readonly blurAction: 'submit' | 'cancel' | 'none';
  readonly enterAction: 'submit' | 'none';
  readonly tabAction: 'submit-and-move' | 'submit' | 'none';
  readonly columns: Readonly<Record<string, FieldPath<TFormValues> | false>>;
  readonly updateMode: 'replace-row' | 'refresh';
  readonly className?: string;
  readonly keyboardActivation: Readonly<InlineKeyboardShortcut> | false;
}

/** Default behavior used by the inline Edit presentation. */
export const DEFAULT_INLINE_OPTIONS = Object.freeze({
  blurAction: 'submit',
  enterAction: 'submit',
  tabAction: 'submit-and-move',
  updateMode: 'replace-row',
} as const);

/** Resolves optional inline values without mutating consumer configuration. */
export function resolveInlineOptions<TRow extends object, TFormValues extends object>(
  options: Readonly<InlineEditorOptions<TRow, TFormValues>> | undefined,
): Readonly<ResolvedInlineEditorOptions<TFormValues>> {
  return Object.freeze({
    blurAction: options?.blurAction ?? DEFAULT_INLINE_OPTIONS.blurAction,
    columns: Object.freeze({ ...(options?.columns ?? {}) }),
    enterAction: options?.enterAction ?? DEFAULT_INLINE_OPTIONS.enterAction,
    keyboardActivation: resolveInlineKeyboardShortcut(options?.keyboardActivation),
    tabAction: options?.tabAction ?? DEFAULT_INLINE_OPTIONS.tabAction,
    updateMode: options?.updateMode ?? DEFAULT_INLINE_OPTIONS.updateMode,
    ...(options?.className === undefined ? {} : { className: options.className }),
  });
}
