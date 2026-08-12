import { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import { commitRowUpdate } from '../core/editing/commit-row-update.js';
import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  captureEditTarget,
  resolveEditTarget,
} from '../datatables/row-target-resolution.js';
import { synchronizeExtensionStateAfterCommit } from '../datatables/synchronize-extension-state.js';

import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { DrawOwnership } from '../core/editing/draw-ownership.js';
import type { EditOperationRunner } from '../core/editing/edit-operation-runner.js';
import type { OwnedOperationRequest } from '../core/editing/operation-owner.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { ResolvedDialogEditingOptions } from '../core/resolve-editing-options.js';
import type { EditTargetCapture } from '../datatables/row-target-resolution.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api } from 'datatables.net';

export interface DialogEditPresentation {
  startValidation(): void;
  restoreAfterValidationFailure(): void;
  restoreAfterOperationFailure(): void;
  setBusy(isBusy: boolean): void;
  showOperationError(error: AltEditorLiteError): void;
  completeSuccess(): void;
}

export interface DialogEditOperationArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly table: Api<TRow>;
  readonly tableElement: HTMLTableElement;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly editing: Readonly<ResolvedDialogEditingOptions>;
  readonly drawOwnership: DrawOwnership<TRow>;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly invalidMessage: string;
  readonly targetUnavailableMessage: string;
}

/** Runs the shared Edit transaction for the dialog presentation. */
export class DialogEditOperation<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly arguments_: DialogEditOperationArguments<TRow, TFormValues>,
  ) {}

  /** Validates, persists, and commits one captured row update. */
  public async run(
    form: EditorFormController<TFormValues>,
    capture: EditTargetCapture<TRow>,
    target: Readonly<EditorOperationTarget>,
    presentation: DialogEditPresentation,
    updateCapture: (capture: EditTargetCapture<TRow>) => void,
  ): Promise<void> {
    const {
      drawOwnership,
      editing,
      editor,
      editOperationRunner,
      errorReporter,
      options,
      table,
      tableElement,
      targetUnavailableMessage,
    } = this.arguments_;

    await editOperationRunner.run({
      ...(options.hooks?.afterSuccess === undefined
        ? {}
        : {
            afterSuccess: async (context) => {
              await Promise.resolve(options.hooks?.afterSuccess?.(context));
            },
          }),
      ...(options.hooks?.beforeSubmit === undefined
        ? {}
        : {
            beforeSubmit: async (transaction, context) => {
              const shouldContinue = await Promise.resolve(
                options.hooks?.beforeSubmit?.(transaction.values, {
                  ...context,
                  original: transaction.original,
                }),
              );
              return shouldContinue !== false;
            },
          }),
      commit: async (row, rowIndex, request: OwnedOperationRequest) => {
        const result = await commitRowUpdate(
          table,
          rowIndex,
          row,
          drawOwnership,
          request.abortController.signal,
          'dialog-edit-success',
        );
        if (!editing.closeOnSuccess) {
          updateCapture(captureEditTarget(table, rowIndex, targetUnavailableMessage));
        }
        return result;
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          tableElement,
          'alteditor-lite:submit',
          {
            editor,
            mode: 'dialog',
            operation: 'edit',
            original: transaction.original,
            type: 'submit',
            values: transaction.values,
          },
        );
      },
      dispatchSuccess: (transaction, result) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
          tableElement,
          'alteditor-lite:success',
          {
            editor,
            mode: 'dialog',
            operation: 'edit',
            original: transaction.original,
            row: result.row,
            type: 'success',
            values: transaction.values,
          },
        );
      },
      mode: 'dialog',
      original: capture.snapshot.original,
      presentation: {
        completeSuccess: () => {
          presentation.completeSuccess();
          synchronizeExtensionStateAfterCommit(table);
          return Promise.resolve();
        },
        restoreAfterOperationFailure: () => {
          presentation.restoreAfterOperationFailure();
        },
        restoreAfterValidationFailure: () => {
          presentation.restoreAfterValidationFailure();
        },
        setBusy: (isBusy) => {
          presentation.setBusy(isBusy);
        },
        showOperationError: (error) => {
          presentation.showOperationError(error);
        },
        startValidation: () => {
          presentation.startValidation();
        },
        validate: async (signal) => {
          const validationResult = await form.validate();
          signal.throwIfAborted();
          if (!validationResult.valid) {
            return {
              error: new AltEditorLiteError({
                code: 'VALIDATION',
                fieldErrors: validationResult.fieldErrors,
                message: this.arguments_.invalidMessage,
                retryable: true,
              }),
              valid: false,
            };
          }
          const collectedForm = await form.collectWithMetadata();
          signal.throwIfAborted();
          return {
            changedFields: [
              ...collectedForm.fieldValues.keys(),
            ] as FieldPath<TFormValues>[],
            collectedFieldValues: collectedForm.fieldValues,
            valid: true,
            values: collectedForm.values,
          };
        },
      },
      reportError: (error, context, publishEvent) => {
        errorReporter.report(error, context, publishEvent);
      },
      revalidateTarget: () =>
        resolveEditTarget(table, tableElement, capture, targetUnavailableMessage),
      target,
    });
  }
}
