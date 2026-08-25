import type { PartialEditorLanguage } from './alt-editor-lite-language.js';
import type { EditingOptions } from './editing-options.js';
import type { EditorOperationTarget } from './editor-operation.js';
import type { BatchChanges, DeepPartial, EditorValues } from './editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { MaybePromise } from '../fields/field-value.js';
import type { FormDependencies } from '../form/form-dependency.js';
import type { FormValidator } from '../form/form-validation.js';

interface OperationContextBase {
  /** Signal aborted when the operation is closed, replaced, or destroyed. */
  readonly signal: AbortSignal;
}

/** Context supplied to a Create persistence operation. */
export interface CreateOperationContext extends OperationContextBase {
  readonly operation: 'create';
  readonly mode: 'dialog';
}

/** Context supplied to a single-record Edit persistence operation. */
export interface EditOperationContext extends OperationContextBase {
  readonly operation: 'edit';
  readonly mode: 'dialog' | 'inline';
  readonly target: Readonly<EditorOperationTarget>;
}

/** Context supplied to a multi-record Edit persistence operation. */
export interface BatchEditOperationContext extends OperationContextBase {
  readonly operation: 'batchEdit';
  readonly mode: 'dialog';
  readonly targets: readonly Readonly<EditorOperationTarget>[];
}

/** Context supplied to a Remove persistence operation. */
export interface RemoveOperationContext extends OperationContextBase {
  readonly operation: 'remove';
  readonly mode: 'dialog';
}

/** Context supplied to a Refresh persistence operation. */
export type RefreshOperationContext =
  | (OperationContextBase & {
      readonly operation: 'refresh';
      readonly mode: 'api';
    })
  | (OperationContextBase & {
      readonly operation: 'refresh';
      readonly mode: 'inline';
      readonly target: Readonly<EditorOperationTarget>;
    });

/** Context supplied to a persistence operation. */
export type OperationContext =
  | CreateOperationContext
  | EditOperationContext
  | BatchEditOperationContext
  | RemoveOperationContext
  | RefreshOperationContext;

type BeforeOpenContextBase = OperationContextBase & {
  readonly mode: 'dialog' | 'inline';
};

/** Context supplied before a dialog or inline presentation opens. */
export type BeforeOpenContext<
  TRow extends object,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The form type preserves editor hook inference.
  TFormValues extends object,
> =
  | (BeforeOpenContextBase & { readonly operation: 'create'; readonly mode: 'dialog' })
  | (BeforeOpenContextBase & {
      readonly operation: 'edit';
      readonly row: Readonly<TRow>;
      readonly target: Readonly<EditorOperationTarget>;
    })
  | (BeforeOpenContextBase & {
      readonly operation: 'batchEdit';
      readonly mode: 'dialog';
      readonly originals: readonly Readonly<TRow>[];
      readonly targets: readonly Readonly<EditorOperationTarget>[];
    })
  | (BeforeOpenContextBase & {
      readonly operation: 'remove';
      readonly mode: 'dialog';
      readonly rows: readonly Readonly<TRow>[];
      readonly targets: readonly Readonly<EditorOperationTarget>[];
    });

/** Context supplied after validation and before submission is observed. */
export type BeforeSubmitContext<TRow extends object> =
  | CreateOperationContext
  | (EditOperationContext & { readonly original: Readonly<TRow> })
  | (BatchEditOperationContext & {
      readonly originals: readonly Readonly<TRow>[];
    });

/** Context supplied after a successful canonical row commit. */
export type AfterSuccessContext<TRow extends object, TFormValues extends object> =
  | {
      readonly operation: 'create';
      readonly mode: 'dialog';
      readonly row: Readonly<TRow>;
      readonly values: Readonly<EditorValues<TFormValues>>;
    }
  | {
      readonly operation: 'edit';
      readonly mode: 'dialog' | 'inline';
      readonly target: Readonly<EditorOperationTarget>;
      readonly original: Readonly<TRow>;
      readonly row: Readonly<TRow>;
      readonly values: Readonly<EditorValues<TFormValues>>;
    }
  | {
      readonly operation: 'batchEdit';
      readonly mode: 'dialog';
      readonly targets: readonly Readonly<EditorOperationTarget>[];
      readonly changes: Readonly<BatchChanges<TFormValues>>;
      readonly originals: readonly Readonly<TRow>[];
      readonly rows: readonly Readonly<TRow>[];
    }
  | {
      readonly operation: 'remove';
      readonly mode: 'dialog';
      readonly rows: readonly Readonly<TRow>[];
    }
  | {
      readonly operation: 'refresh';
      readonly mode: 'api' | 'inline';
      readonly target?: Readonly<EditorOperationTarget>;
    };

/** Context supplied to the non-recursive error callback. */
interface EditorErrorHookContextBase {
  readonly phase:
    'open' | 'validation' | 'submit' | 'persistence' | 'commit' | 'afterSuccess';
  readonly committed: boolean;
}

/** Context supplied to the non-recursive error callback. */
export type EditorErrorHookContext = EditorErrorHookContextBase &
  (
    | { readonly operation: 'create'; readonly mode: 'dialog' }
    | {
        readonly operation: 'edit';
        readonly mode: 'dialog' | 'inline';
        readonly target: Readonly<EditorOperationTarget>;
      }
    | {
        readonly operation: 'batchEdit';
        readonly mode: 'dialog';
        readonly targets: readonly Readonly<EditorOperationTarget>[];
      }
    | { readonly operation: 'remove'; readonly mode: 'dialog' }
    | { readonly operation: 'refresh'; readonly mode: 'api' }
    | {
        readonly operation: 'refresh';
        readonly mode: 'inline';
        readonly target: Readonly<EditorOperationTarget>;
      }
  );

/** Optional lifecycle callbacks that cannot replace submitted values. */
/* eslint-disable @typescript-eslint/no-invalid-void-type -- Veto hooks may omit a decision. */
export interface EditorHooks<TRow extends object, TFormValues extends object> {
  readonly beforeOpen?: (
    context: BeforeOpenContext<TRow, TFormValues>,
  ) => MaybePromise<boolean | void>;
  readonly beforeSubmit?: (
    values: Readonly<EditorValues<TFormValues> | BatchChanges<TFormValues>>,
    context: BeforeSubmitContext<TRow>,
  ) => MaybePromise<boolean | void>;
  readonly afterSuccess?: (
    context: AfterSuccessContext<TRow, TFormValues>,
  ) => MaybePromise<void>;
  readonly onError?: (
    error: import('./alt-editor-lite-error.js').AltEditorLiteError,
    context: EditorErrorHookContext,
  ) => void;
}
/* eslint-enable @typescript-eslint/no-invalid-void-type -- Veto hook declarations end here. */

/**
 * Optional synchronous or asynchronous editor operations.
 */
export interface EditorOperations<TRow extends object, TFormValues extends object> {
  /**
   * Persists collected Create values and returns one complete row.
   *
   * The Host is updated only after this callback resolves successfully.
   */
  create?(
    values: Readonly<EditorValues<TFormValues>>,
    context: CreateOperationContext,
  ): TRow | Promise<TRow>;
  /**
   * Persists collected Edit values and returns one complete replacement row.
   *
   * @param values - Enabled values collected from the Edit form.
   * @param original - Detached snapshot whose plain records and arrays are recursively frozen.
   * @param context - Owned operation context.
   */
  update?(
    values: Readonly<EditorValues<TFormValues>>,
    original: Readonly<TRow>,
    context: EditOperationContext,
  ): TRow | Promise<TRow>;
  /**
   * Persists one common change set and returns position-matched canonical rows.
   */
  updateMany?(
    changes: Readonly<BatchChanges<TFormValues>>,
    originals: readonly Readonly<TRow>[],
    context: BatchEditOperationContext,
  ): readonly TRow[] | Promise<readonly TRow[]>;
  /**
   * Persists removal of every row captured by the confirmation snapshot.
   *
   * Host records are removed only after this callback resolves successfully.
   */
  remove?(
    rows: readonly Readonly<TRow>[],
    context: RemoveOperationContext,
  ): void | Promise<void>;
  /**
   * Refreshes data through a consumer-owned, optionally cancellable operation.
   *
   * When configured, this callback replaces the default `ajax.reload` or local
   * presentation behavior and owns any resulting Host update.
   */
  refresh?(context: RefreshOperationContext): void | Promise<void>;
}

/**
 * Synchronous client-side row construction and update mappings.
 */
export interface ClientSideOperations<TRow extends object, TFormValues extends object> {
  /**
   * Builds one complete record from collected form values.
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
  /** Declarative field state derived from dialog form values. */
  readonly dependencies?: FormDependencies<TFormValues>;
  /** Optional cross-field validator shared by dialog and inline editing. */
  readonly validateForm?: FormValidator<TFormValues>;
  /** Composable Dialog Edit and Inline Edit behavior. */
  readonly editing?: EditingOptions<TRow, TFormValues>;
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
  /** Language data or nested overrides merged with the English fallback. */
  readonly language?: PartialEditorLanguage;
  /** Optional lifecycle callbacks. */
  readonly hooks?: EditorHooks<TRow, TFormValues>;
}
