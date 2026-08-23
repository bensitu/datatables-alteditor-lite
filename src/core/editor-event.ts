import type { AltEditorLiteError } from './alt-editor-lite-error.js';
import type { AltEditorLite } from './alt-editor-lite.js';
import type { EditorOperationMode, EditorOperationTarget } from './editor-operation.js';
import type { BatchChanges, EditorValues } from './editor-values.js';

/** Names of the stable DOM events published by the editor. */
export type EditorEventName =
  | 'alteditor-lite:open'
  | 'alteditor-lite:close'
  | 'alteditor-lite:submit'
  | 'alteditor-lite:success'
  | 'alteditor-lite:error'
  | 'alteditor-lite:refresh'
  | 'alteditor-lite:destroy';

/** Reason that an operation dialog was closed. */
export type EditorCloseReason =
  'api' | 'cancel' | 'escape' | 'success' | 'unchanged' | 'redraw';

interface EditorEventDetailBase<TRow extends object, TFormValues extends object> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
}

/** Detail published after an operation dialog or inline editor is fully open. */
export type EditorOpenEventDetail<
  TRow extends object,
  TFormValues extends object,
> = EditorEventDetailBase<TRow, TFormValues> &
  (
    | {
        readonly type: 'open';
        readonly operation: 'create';
        readonly mode: 'dialog';
      }
    | {
        readonly type: 'open';
        readonly operation: 'edit';
        readonly mode: 'dialog' | 'inline';
        readonly target: Readonly<EditorOperationTarget>;
      }
    | {
        readonly type: 'open';
        readonly operation: 'batchEdit';
        readonly mode: 'dialog';
        readonly originals: readonly Readonly<TRow>[];
        readonly targets: readonly Readonly<EditorOperationTarget>[];
      }
    | {
        readonly type: 'open';
        readonly operation: 'remove';
        readonly mode: 'dialog';
      }
  );

/** Create detail published after validation and collection, before persistence. */
export interface EditorCreateSubmitEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'submit';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'create';
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Edit detail published after target validation, before persistence. */
export interface EditorEditSubmitEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'submit';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'edit';
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly original: Readonly<TRow>;
  readonly mode: 'dialog' | 'inline';
  readonly target: Readonly<EditorOperationTarget>;
}

/** Batch Edit detail published after validation, before persistence. */
export interface EditorBatchEditSubmitEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'submit';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'batchEdit';
  readonly changes: Readonly<BatchChanges<TFormValues>>;
  readonly originals: readonly Readonly<TRow>[];
  readonly mode: 'dialog';
  readonly targets: readonly Readonly<EditorOperationTarget>[];
}

/** Remove detail published after snapshot validation, before persistence. */
export interface EditorRemoveSubmitEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'submit';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'remove';
  readonly rows: readonly Readonly<TRow>[];
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Concrete detail union for the three dialog submission operations. */
export type EditorSubmitEventDetail<TRow extends object, TFormValues extends object> =
  | EditorCreateSubmitEventDetail<TRow, TFormValues>
  | EditorEditSubmitEventDetail<TRow, TFormValues>
  | EditorBatchEditSubmitEventDetail<TRow, TFormValues>
  | EditorRemoveSubmitEventDetail<TRow, TFormValues>;

/** Detail published after the Host applies a created record. */
export interface EditorCreateSuccessEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'success';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'create';
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly row: Readonly<TRow>;
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Detail published after the Host applies an updated record. */
export interface EditorEditSuccessEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'success';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'edit';
  readonly original: Readonly<TRow>;
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly row: Readonly<TRow>;
  readonly mode: 'dialog' | 'inline';
  readonly target: Readonly<EditorOperationTarget>;
}

/** Detail published after the Host applies a batch of canonical rows. */
export interface EditorBatchEditSuccessEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'success';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'batchEdit';
  readonly changes: Readonly<BatchChanges<TFormValues>>;
  readonly originals: readonly Readonly<TRow>[];
  readonly rows: readonly Readonly<TRow>[];
  readonly mode: 'dialog';
  readonly targets: readonly Readonly<EditorOperationTarget>[];
}

/** Detail published after the Host removes all captured records. */
export interface EditorRemoveSuccessEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'success';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'remove';
  readonly rows: readonly Readonly<TRow>[];
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Detail published after a Host refresh completes successfully. */
export interface EditorRefreshSuccessEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'success';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'refresh';
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Concrete detail union for every successful operation. */
export type EditorSuccessEventDetail<TRow extends object, TFormValues extends object> =
  | EditorCreateSuccessEventDetail<TRow, TFormValues>
  | EditorEditSuccessEventDetail<TRow, TFormValues>
  | EditorBatchEditSuccessEventDetail<TRow, TFormValues>
  | EditorRemoveSuccessEventDetail<TRow, TFormValues>
  | EditorRefreshSuccessEventDetail<TRow, TFormValues>;

/** Detail published after an error is visible without a Host mutation. */
export type EditorErrorEventDetail<
  TRow extends object,
  TFormValues extends object,
> = EditorEventDetailBase<TRow, TFormValues> & {
  readonly type: 'error';
  readonly error: AltEditorLiteError;
} & (
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

/** Detail published after dialog cleanup and focus restoration. */
export type EditorCloseEventDetail<
  TRow extends object,
  TFormValues extends object,
> = EditorEventDetailBase<TRow, TFormValues> & {
  readonly type: 'close';
  readonly reason: EditorCloseReason;
} & (
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
  );

/** Detail published at the start and completion of a Refresh operation. */
export interface EditorRefreshEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'refresh';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly operation: 'refresh';
  readonly phase: 'start' | 'complete';
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/** Detail published once after all owned resources are destroyed. */
export interface EditorDestroyEventDetail<
  TRow extends object,
  TFormValues extends object,
> {
  readonly type: 'destroy';
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly mode: EditorOperationMode;
  readonly target?: Readonly<EditorOperationTarget>;
}

/**
 * Name-to-detail mapping for every stable editor event.
 */
export interface EditorEventDetailMap<TRow extends object, TFormValues extends object> {
  readonly 'alteditor-lite:open': EditorOpenEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:close': EditorCloseEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:submit': EditorSubmitEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:success': EditorSuccessEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:error': EditorErrorEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:refresh': EditorRefreshEventDetail<TRow, TFormValues>;
  readonly 'alteditor-lite:destroy': EditorDestroyEventDetail<TRow, TFormValues>;
}

/**
 * Dispatches a non-bubbling, observation-only editor event.
 *
 * @param eventTarget - Host event destination that owns consumer listeners.
 * @param eventName - Stable event name.
 * @param detail - Concrete event detail for that name.
 */
export function dispatchEditorEvent<
  TRow extends object,
  TFormValues extends object,
  TEventName extends keyof EditorEventDetailMap<TRow, TFormValues>,
>(
  eventTarget: EventTarget,
  eventName: TEventName,
  detail: EditorEventDetailMap<TRow, TFormValues>[TEventName],
): void {
  eventTarget.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: false,
      cancelable: false,
      detail,
    }),
  );
}
