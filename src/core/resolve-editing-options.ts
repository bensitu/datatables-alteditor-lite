import { resolveInlineKeyboardShortcut } from '../inline/inline-keyboard-shortcut.js';

import { EditorConfigurationError } from './alt-editor-lite-error.js';

import type {
  DialogTemplateOption,
  EditingOptions,
  InlineActivation,
} from './editing-options.js';
import type { InlineKeyboardActivation } from '../inline/inline-keyboard-shortcut.js';
import type { FieldPath } from '../object-path/field-path.js';

/** Resolved dialog settings; operation-specific callbacks remain on editor options. */
export interface ResolvedDialogEditingOptions {
  readonly enabled: boolean;
  readonly className?: string;
  readonly template?: DialogTemplateOption;
  readonly closeOnSuccess: boolean;
}

/** Inline behavior with every default applied. */
export interface ResolvedInlineEditingOptions<TFormValues extends object> {
  readonly enabled: boolean;
  readonly activation: InlineActivation;
  readonly blurAction: 'submit' | 'cancel' | 'none';
  readonly enterAction: 'submit' | 'none';
  readonly tabAction: 'submit-and-move' | 'submit' | 'none';
  readonly columns: Readonly<Record<string, FieldPath<TFormValues> | false>>;
  readonly updateMode: 'replace-row' | 'refresh';
  readonly className?: string;
  readonly keyboardActivation: InlineKeyboardActivation;
}

/** Complete editing configuration used by runtime components. */
export interface ResolvedEditingOptions<TFormValues extends object> {
  readonly dialog: Readonly<ResolvedDialogEditingOptions>;
  readonly inline: Readonly<ResolvedInlineEditingOptions<TFormValues>>;
}

function assertOptionalBoolean(value: unknown, propertyName: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new EditorConfigurationError(`${propertyName} must be a boolean.`);
  }
}

function assertOptionalObject(value: unknown, propertyName: string): void {
  if (
    value !== undefined &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  ) {
    throw new EditorConfigurationError(`${propertyName} must be an object.`);
  }
}

const classTokenPattern = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/u;

function assertOptionalClassName(value: unknown, propertyName: string): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.split(/\s+/u).some((token) => !classTokenPattern.test(token))
  ) {
    throw new EditorConfigurationError(`${propertyName} is not valid.`);
  }
}

/** Resolves composable editing options without mutating consumer configuration. */
export function resolveEditingOptions<TRow extends object, TFormValues extends object>(
  options: Readonly<EditingOptions<TRow, TFormValues>> | undefined,
): Readonly<ResolvedEditingOptions<TFormValues>> {
  assertOptionalObject(options, 'editing');
  const dialog = options?.dialog;
  const inline = options?.inline;
  assertOptionalObject(dialog, 'editing.dialog');
  assertOptionalObject(inline, 'editing.inline');
  assertOptionalBoolean(dialog?.enabled, 'editing.dialog.enabled');
  assertOptionalBoolean(dialog?.closeOnSuccess, 'editing.dialog.closeOnSuccess');
  assertOptionalClassName(dialog?.className, 'editing.dialog.className');
  if (
    dialog?.removeConfirmation !== undefined &&
    typeof dialog.removeConfirmation !== 'function'
  ) {
    throw new EditorConfigurationError(
      'editing.dialog.removeConfirmation must be a function.',
    );
  }
  assertOptionalBoolean(inline?.enabled, 'editing.inline.enabled');

  const configuredActivation: unknown = inline?.activation;
  const activation = configuredActivation ?? 'doubleClick';
  if (activation !== 'doubleClick' && activation !== 'hover') {
    throw new EditorConfigurationError('editing.inline.activation is not valid.');
  }

  const resolvedDialog = Object.freeze({
    closeOnSuccess: dialog?.closeOnSuccess ?? true,
    enabled: dialog?.enabled ?? true,
    ...(dialog?.className === undefined ? {} : { className: dialog.className }),
    ...(dialog?.template === undefined ? {} : { template: dialog.template }),
  });
  const resolvedInline = Object.freeze({
    activation,
    blurAction: inline?.blurAction ?? 'submit',
    columns: Object.freeze({ ...(inline?.columns ?? {}) }),
    enabled: inline?.enabled ?? false,
    enterAction: inline?.enterAction ?? 'submit',
    keyboardActivation: resolveInlineKeyboardShortcut(inline?.keyboardActivation),
    tabAction: inline?.tabAction ?? 'submit-and-move',
    updateMode: inline?.updateMode ?? 'replace-row',
    ...(inline?.className === undefined ? {} : { className: inline.className }),
  });

  return Object.freeze({ dialog: resolvedDialog, inline: resolvedInline });
}
