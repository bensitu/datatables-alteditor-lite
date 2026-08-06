import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { EditPresentationAdapter } from '../core/editing/edit-presentation-adapter.js';
import type {
  EditCommitResult,
  EditValidationResult,
} from '../core/editing/edit-transaction.js';

/** Callbacks that bind the shared Edit runner to one inline session. */
export interface InlineEditPresentationCallbacks<
  TRow extends object,
  TFormValues extends object,
> {
  readonly completeSuccess: (result: Readonly<EditCommitResult<TRow>>) => Promise<void>;
  readonly restoreAfterOperationFailure: () => void;
  readonly restoreAfterValidationFailure: () => void;
  readonly setBusy: (isBusy: boolean) => void;
  readonly showOperationError: (error: AltEditorLiteError) => void;
  readonly startValidation: () => void;
  readonly validate: (
    signal: AbortSignal,
  ) => Promise<Readonly<EditValidationResult<TFormValues>>>;
}

/** Adapts an inline session to the shared Edit transaction runner. */
export class InlineEditPresentationAdapter<
  TRow extends object,
  TFormValues extends object,
> implements EditPresentationAdapter<TRow, TFormValues> {
  public constructor(
    private readonly callbacks: InlineEditPresentationCallbacks<TRow, TFormValues>,
  ) {}

  public startValidation(): void {
    this.callbacks.startValidation();
  }

  public validate(
    signal: AbortSignal,
  ): Promise<Readonly<EditValidationResult<TFormValues>>> {
    return this.callbacks.validate(signal);
  }

  public setBusy(isBusy: boolean): void {
    this.callbacks.setBusy(isBusy);
  }

  public showOperationError(error: AltEditorLiteError): void {
    this.callbacks.showOperationError(error);
  }

  public restoreAfterValidationFailure(): void {
    this.callbacks.restoreAfterValidationFailure();
  }

  public restoreAfterOperationFailure(): void {
    this.callbacks.restoreAfterOperationFailure();
  }

  public completeSuccess(result: Readonly<EditCommitResult<TRow>>): Promise<void> {
    return this.callbacks.completeSuccess(result);
  }
}
