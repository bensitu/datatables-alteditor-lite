import type { FieldPath } from '../../object-path/field-path.js';
import type { AltEditorLiteError } from '../alt-editor-lite-error.js';
import type { EditorOperationTarget } from '../editor-operation.js';
import type { EditorValues } from '../editor-values.js';

/** Immutable values and identity shared by every Edit presentation. */
export interface EditTransaction<TRow extends object, TFormValues extends object> {
  readonly mode: 'dialog' | 'inline';
  readonly original: Readonly<TRow>;
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly collectedFieldValues: ReadonlyMap<string, unknown>;
  readonly changedFields: readonly FieldPath<TFormValues>[];
  readonly target: Readonly<EditorOperationTarget>;
}

/** Presentation validation result consumed by the shared Edit runner. */
export type EditValidationResult<TFormValues extends object> =
  | {
      readonly valid: false;
      readonly error: AltEditorLiteError;
    }
  | {
      readonly valid: true;
      readonly values: Readonly<EditorValues<TFormValues>>;
      readonly collectedFieldValues: ReadonlyMap<string, unknown>;
      readonly changedFields: readonly FieldPath<TFormValues>[];
    };

/** Result of a committed replacement or consumer-owned refresh. */
export interface EditCommitResult<TRow extends object> {
  readonly row: Readonly<TRow>;
}
