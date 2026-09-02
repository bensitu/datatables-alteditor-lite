import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { InlineKeyboardActivation } from '../inline/inline-keyboard-shortcut.js';
import type { FieldPath } from '../object-path/field-path.js';

/** User interaction that opens an inline editing session. */
export type InlineActivation = 'doubleClick' | 'hover';

/**
 * Consumer-owned source used to arrange fields in a dialog form.
 *
 * A string is interpreted as a selector. An `HTMLTemplateElement` contributes a
 * clone of its content, while any other `HTMLElement` is deeply cloned. The
 * source node is never detached or mutated.
 */
export type DialogTemplateSource = string | HTMLElement;

/** Dialog form operation supplied to a template resolver. */
export interface DialogTemplateContext {
  readonly operation: 'create' | 'edit' | 'batchEdit';
}

/** Selects a form template for one dialog opening. */
export type DialogTemplateResolver = (
  context: Readonly<DialogTemplateContext>,
) => DialogTemplateSource | undefined;

/** Static or operation-specific dialog template configuration. */
export type DialogTemplateOption = DialogTemplateSource | DialogTemplateResolver;

/** Stable values supplied to a custom Remove confirmation renderer. */
export interface RemoveConfirmationContext<TRow extends object> {
  readonly rows: readonly Readonly<TRow>[];
  readonly count: number;
  readonly language: Readonly<AltEditorLiteLanguage>;
}

/** Content accepted from a custom Remove confirmation renderer. */
export type RemoveConfirmationContent = string | HTMLElement | DocumentFragment;

/** Creates body content for one current Remove snapshot. */
export type RemoveConfirmationRenderer<TRow extends object> = (
  context: Readonly<RemoveConfirmationContext<TRow>>,
) => RemoveConfirmationContent;

/** Configuration for the dialog Edit presentation. */
export interface DialogEditingOptions<TRow extends object = object> {
  /** Whether Dialog Edit is available. Defaults to true. */
  readonly enabled?: boolean;
  /** Optional CSS classes applied to the editor dialog element. */
  readonly className?: string;
  /** Optional consumer-owned layout source for Create and Edit forms. */
  readonly template?: DialogTemplateOption;
  /** Whether successful Create and Edit operations close the dialog. */
  readonly closeOnSuccess?: boolean;
  /** Optional body renderer for Remove confirmations. */
  readonly removeConfirmation?: RemoveConfirmationRenderer<TRow>;
}

/** Configuration for single-cell inline editing. */
export interface InlineEditingOptions<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The row type keeps option inference aligned with the editor.
  TRow extends object,
  TFormValues extends object,
> {
  /** Whether inline editing is available. Defaults to false. */
  readonly enabled?: boolean;
  /** User interaction that opens an inline session. */
  readonly activation?: InlineActivation;
  readonly blurAction?: 'submit' | 'cancel' | 'none';
  readonly enterAction?: 'submit' | 'none';
  readonly tabAction?: 'submit-and-move' | 'submit' | 'none';
  readonly columns?: Readonly<Record<string, FieldPath<TFormValues> | false>>;
  readonly updateMode?: 'replace-row' | 'refresh';
  readonly className?: string;
  /** Set to false to disable only focused-cell keyboard activation. */
  readonly keyboardActivation?: InlineKeyboardActivation;
}

/** Composable dialog and inline editing configuration. */
export interface EditingOptions<TRow extends object, TFormValues extends object> {
  readonly dialog?: DialogEditingOptions<TRow>;
  readonly inline?: InlineEditingOptions<TRow, TFormValues>;
}
