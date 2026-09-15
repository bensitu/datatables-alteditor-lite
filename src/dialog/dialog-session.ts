import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { BatchEditorFormController } from '../form/batch-editor-form-controller.js';
import type { EditorFormController } from '../form/form-controller.js';

/** Resources owned by the currently open dialog action. */
export type DialogSession<TRow extends object, TFormValues extends object, TTarget> =
  | {
      readonly action: 'create';
      readonly form: EditorFormController<TFormValues>;
    }
  | {
      readonly action: 'edit';
      readonly form: EditorFormController<TFormValues>;
      operationTarget: Readonly<EditorOperationTarget>;
      original: Readonly<TRow>;
      recordTarget: TTarget;
    }
  | {
      readonly action: 'batchEdit';
      readonly form: BatchEditorFormController<TFormValues>;
      readonly operationTargets: readonly Readonly<EditorOperationTarget>[];
      originals: readonly Readonly<TRow>[];
      readonly recordTargets: readonly TTarget[];
    }
  | {
      readonly action: 'remove';
      readonly operationTargets: readonly Readonly<EditorOperationTarget>[];
      readonly originals: readonly Readonly<TRow>[];
      readonly recordTargets: readonly TTarget[];
    };

/** Releases the form owned by a dialog session, when present. */
export function destroyDialogSession<
  TRow extends object,
  TFormValues extends object,
  TTarget,
>(session: DialogSession<TRow, TFormValues, TTarget>): void {
  switch (session.action) {
    case 'create':
    case 'edit':
    case 'batchEdit': {
      session.form.destroy();
      return;
    }
    case 'remove': {
      return;
    }
  }
}

/** Returns the operation metadata associated with a dialog session. */
export function getDialogSessionOperation<
  TRow extends object,
  TFormValues extends object,
  TTarget,
>(
  session: DialogSession<TRow, TFormValues, TTarget>,
):
  | { readonly operation: 'create' | 'remove' }
  | { readonly operation: 'edit'; readonly target: Readonly<EditorOperationTarget> }
  | {
      readonly operation: 'batchEdit';
      readonly targets: readonly Readonly<EditorOperationTarget>[];
    } {
  switch (session.action) {
    case 'edit':
      return { operation: session.action, target: session.operationTarget } as const;
    case 'batchEdit':
      return { operation: session.action, targets: session.operationTargets } as const;
    case 'create':
    case 'remove':
      return { operation: session.action } as const;
  }
}
