import type { AltEditorLiteError } from '../alt-editor-lite-error.js';
import type { EditCommitResult, EditValidationResult } from './edit-transaction.js';

/** Presentation operations required by the shared Edit transaction. */
export interface EditPresentationAdapter<
  TRow extends object,
  TFormValues extends object,
> {
  startValidation(): void;
  validate(signal: AbortSignal): Promise<Readonly<EditValidationResult<TFormValues>>>;
  setBusy(isBusy: boolean): void;
  showOperationError(error: AltEditorLiteError): void | Promise<void>;
  restoreAfterValidationFailure(): void;
  restoreAfterOperationFailure(): void;
  completeSuccess(result: Readonly<EditCommitResult<TRow>>): Promise<void>;
}
