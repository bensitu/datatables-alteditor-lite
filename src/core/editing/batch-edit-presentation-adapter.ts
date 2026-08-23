import type { AltEditorLiteError } from '../alt-editor-lite-error.js';
import type {
  BatchEditCommitResult,
  BatchEditValidationResult,
} from './batch-edit-transaction.js';

/** Presentation operations required by the batch edit transaction runner. */
export interface BatchEditPresentationAdapter<
  TRow extends object,
  TFormValues extends object,
> {
  startValidation(): void;
  validate(
    signal: AbortSignal,
  ): Promise<Readonly<BatchEditValidationResult<TFormValues>>>;
  setBusy(isBusy: boolean): void;
  showOperationError(error: AltEditorLiteError): void | Promise<void>;
  restoreAfterValidationFailure(): void;
  restoreAfterOperationFailure(): void;
  completeUnchanged(): Promise<void>;
  completeSuccess(result: Readonly<BatchEditCommitResult<TRow>>): Promise<void>;
}
