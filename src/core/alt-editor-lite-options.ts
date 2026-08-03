import type { PartialEditorLanguage } from './alt-editor-lite-language.js';
import type { EditorOperation } from './editor-operation.js';
import type { DeepPartial, EditorValues } from './editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api } from 'datatables.net';

/**
 * Context supplied to a persistence operation.
 */
export interface OperationContext<TRow extends object> {
  /** Public DataTables API owned by the editor. */
  readonly table: Api<TRow>;
  /** Signal aborted when the operation is closed, replaced, or destroyed. */
  readonly signal: AbortSignal;
  /** Operation currently owning the request. */
  readonly operation: EditorOperation;
}

/**
 * Optional synchronous or asynchronous editor operations.
 */
export interface EditorOperations<TRow extends object, TFormValues extends object> {
  /**
   * Persists collected Create values and returns one complete row.
   *
   * DataTables is mutated only after this callback resolves successfully.
   */
  create?(
    values: Readonly<EditorValues<TFormValues>>,
    context: OperationContext<TRow>,
  ): TRow | Promise<TRow>;
  /**
   * Persists collected Edit values and returns one complete replacement row.
   *
   * @param values - Enabled values collected from the Edit form.
   * @param original - Shallow immutable snapshot captured before the dialog opened.
   * @param context - Owned operation context.
   */
  update?(
    values: Readonly<EditorValues<TFormValues>>,
    original: Readonly<TRow>,
    context: OperationContext<TRow>,
  ): TRow | Promise<TRow>;
  /**
   * Persists removal of every row captured by the confirmation snapshot.
   *
   * DataTables rows are removed only after this callback resolves successfully.
   */
  remove?(
    rows: readonly Readonly<TRow>[],
    context: OperationContext<TRow>,
  ): void | Promise<void>;
  /**
   * Refreshes data through a consumer-owned, optionally cancellable operation.
   *
   * When configured, this callback replaces the default `ajax.reload` or local
   * draw behavior and owns any resulting DataTables mutation.
   */
  refresh?(context: OperationContext<TRow>): void | Promise<void>;
}

/**
 * Synchronous client-side row construction and update mappings.
 */
export interface ClientSideOperations<TRow extends object, TFormValues extends object> {
  /**
   * Builds one complete DataTables row from collected form values.
   *
   * Returning a promise is intentionally unsupported.
   */
  createRow?(values: Readonly<EditorValues<TFormValues>>): TRow;
  /**
   * Builds one complete replacement row without mutating the original snapshot.
   *
   * Returning a promise is intentionally unsupported.
   */
  updateRow?(original: Readonly<TRow>, values: Readonly<EditorValues<TFormValues>>): TRow;
}

/**
 * Configuration for an AltEditorLite instance.
 */
export interface AltEditorLiteOptions<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> {
  /** Ordered field definitions used by Create and Edit forms. */
  readonly fields: readonly FieldConfig<TFormValues>[];
  /**
   * Asynchronous editor operations.
   *
   * A capability cannot also define the matching `clientSide` mapper.
   */
  readonly operations?: EditorOperations<TRow, TFormValues>;
  /**
   * Synchronous client-side row mappings.
   *
   * Create requires `createRow`; Edit otherwise falls back to a safe merge of
   * declared field paths.
   */
  readonly clientSide?: ClientSideOperations<TRow, TFormValues>;
  /** Whether successful Create and Edit operations close the dialog. Defaults to true. */
  readonly closeOnSuccess?: boolean;
  /** Language data or nested overrides merged with the English fallback. */
  readonly language?: PartialEditorLanguage;
}
