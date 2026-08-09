import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

/** Configurable shortcut used to edit the focused KeyTable cell. */
export interface InlineKeyboardShortcut {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
}

const reservedKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export const DEFAULT_INLINE_KEYBOARD_SHORTCUT: Readonly<InlineKeyboardShortcut> =
  Object.freeze({ key: 'F2' });

/** Resolves and validates a keyboard activation shortcut. */
export function resolveInlineKeyboardShortcut(
  shortcut: unknown,
): Readonly<InlineKeyboardShortcut> | false {
  if (shortcut === false) {
    return false;
  }
  const candidate: unknown =
    shortcut === undefined ? DEFAULT_INLINE_KEYBOARD_SHORTCUT : shortcut;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('key' in candidate) ||
    typeof candidate.key !== 'string' ||
    candidate.key.length === 0 ||
    reservedKeys.has(candidate.key)
  ) {
    throw new EditorConfigurationError('inline.keyboardActivation is not valid.');
  }
  const validatedCandidate = candidate as Readonly<
    Partial<Record<keyof InlineKeyboardShortcut, unknown>> & { readonly key: string }
  >;
  for (const modifier of ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'] as const) {
    if (
      validatedCandidate[modifier] !== undefined &&
      typeof validatedCandidate[modifier] !== 'boolean'
    ) {
      throw new EditorConfigurationError('inline.keyboardActivation is not valid.');
    }
  }
  return Object.freeze({
    key: validatedCandidate.key,
    ...(validatedCandidate.ctrlKey === undefined
      ? {}
      : { ctrlKey: validatedCandidate.ctrlKey as boolean }),
    ...(validatedCandidate.altKey === undefined
      ? {}
      : { altKey: validatedCandidate.altKey as boolean }),
    ...(validatedCandidate.shiftKey === undefined
      ? {}
      : { shiftKey: validatedCandidate.shiftKey as boolean }),
    ...(validatedCandidate.metaKey === undefined
      ? {}
      : { metaKey: validatedCandidate.metaKey as boolean }),
  });
}

/** Matches an owned native key event without claiming it. */
export function matchesInlineKeyboardShortcut(
  event: KeyboardEvent,
  shortcut: Readonly<InlineKeyboardShortcut>,
): boolean {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    event.key === shortcut.key &&
    event.ctrlKey === (shortcut.ctrlKey ?? false) &&
    event.altKey === (shortcut.altKey ?? false) &&
    event.shiftKey === (shortcut.shiftKey ?? false) &&
    event.metaKey === (shortcut.metaKey ?? false)
  );
}
