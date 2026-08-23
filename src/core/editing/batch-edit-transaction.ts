import type { FieldPath } from '../../object-path/field-path.js';
import type { AltEditorLiteError } from '../alt-editor-lite-error.js';
import type { EditorOperationTarget } from '../editor-operation.js';
import type { BatchChanges } from '../editor-values.js';

/** Immutable changes and identities shared by a batch edit operation. */
export interface BatchEditTransaction<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly changes: Readonly<BatchChanges<TFormValues>>;
  readonly changedFields: readonly FieldPath<TFormValues>[];
  readonly collectedFieldValues: ReadonlyMap<string, unknown>;
  readonly originals: readonly Readonly<TRow>[];
  readonly recordTargets: readonly TTarget[];
  readonly targets: readonly Readonly<EditorOperationTarget>[];
}

/** Validation result consumed by the batch edit transaction runner. */
export type BatchEditValidationResult<TFormValues extends object> =
  | { readonly valid: false; readonly error: AltEditorLiteError }
  | {
      readonly valid: true;
      readonly changes: Readonly<BatchChanges<TFormValues>>;
      readonly changedFields: readonly FieldPath<TFormValues>[];
      readonly collectedFieldValues: ReadonlyMap<string, unknown>;
    };

/** Canonical rows committed by a successful batch edit operation. */
export interface BatchEditCommitResult<TRow extends object> {
  readonly rows: readonly Readonly<TRow>[];
}
