import type { PartialEditorLanguage } from './alt-editor-lite-language.js';
import type { DeepPartial, EditorValues } from './editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';

/**
 * Synchronous client-side row construction supported by this release.
 */
export interface ClientSideOperations<TRow extends object, TFormValues extends object> {
  /**
   * Builds one complete DataTables row from collected form values.
   *
   * Returning a promise is intentionally unsupported.
   */
  createRow?(values: Readonly<EditorValues<TFormValues>>): TRow;
}

/**
 * Configuration for an AltEditorLite instance.
 */
export interface AltEditorLiteOptions<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> {
  /** Ordered field definitions used by the Create form. */
  readonly fields: readonly FieldConfig<TFormValues>[];
  /** Synchronous client-side row construction. */
  readonly clientSide?: ClientSideOperations<TRow, TFormValues>;
  /** Whether a successful Create closes the dialog. Defaults to true. */
  readonly closeOnSuccess?: boolean;
  /** Nested language overrides merged with the English fallback. */
  readonly language?: PartialEditorLanguage;
}
