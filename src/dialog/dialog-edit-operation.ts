import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { readHostRecord } from '../host/host-record-reader.js';

import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { EditOperationRunner } from '../core/editing/edit-operation-runner.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { ResolvedDialogEditingOptions } from '../core/resolve-editing-options.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { EditorHost } from '../host/editor-host.js';
import type { FieldPath } from '../object-path/field-path.js';

export interface DialogEditPresentation {
  startValidation(): void;
  restoreAfterValidationFailure(): void;
  restoreAfterOperationFailure(): void;
  setBusy(isBusy: boolean): void;
  showOperationError(error: AltEditorLiteError): void;
  completeSuccess(): Promise<void>;
}

export interface DialogEditOperationArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly eventTarget: EventTarget;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly editing: Readonly<ResolvedDialogEditingOptions>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly host: EditorHost<TRow, TTarget>;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly onPresentationComplete: () => void;
}

/** Runs the shared Edit transaction for the dialog presentation. */
export class DialogEditOperation<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  public constructor(
    private readonly arguments_: DialogEditOperationArguments<TRow, TFormValues, TTarget>,
  ) {}

  /** Validates, persists, and commits one captured row update. */
  public async run(
    form: EditorFormController<TFormValues>,
    recordTarget: TTarget,
    original: Readonly<TRow>,
    target: Readonly<EditorOperationTarget>,
    presentation: DialogEditPresentation,
    updateCommittedTarget: (target: TTarget) => void,
    updateRetainedForm: (original: Readonly<TRow>) => Promise<void>,
  ): Promise<void> {
    const {
      editing,
      editor,
      editOperationRunner,
      errorReporter,
      host,
      options,
      eventTarget,
    } = this.arguments_;
    let committedTarget = recordTarget;
    let committedRow: Readonly<TRow> | undefined;
    let committedSignal: AbortSignal | undefined;

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
      commit: async (row, request) => {
        committedSignal = request.abortController.signal;
        const nextTarget = await host.applyUpdate(recordTarget, row, {
          mode: 'dialog',
          operation: 'edit',
          signal: request.abortController.signal,
        });
        committedTarget = nextTarget ?? recordTarget;
        committedRow = row;
        if (!editing.closeOnSuccess) {
          updateCommittedTarget(committedTarget);
        }
        return Object.freeze({ row });
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          eventTarget,
          'alteditor-lite:submit',
          {
            editor,
            mode: 'dialog',
            operation: 'edit',
            original: transaction.original,
            target,
            type: 'submit',
            values: transaction.values,
          },
        );
      },
      dispatchSuccess: (transaction, result) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
          eventTarget,
          'alteditor-lite:success',
          {
            editor,
            mode: 'dialog',
            operation: 'edit',
            original: transaction.original,
            row: result.row,
            target,
            type: 'success',
            values: transaction.values,
          },
        );
      },
      mode: 'dialog',
      original,
      presentation: {
        completeSuccess: async () => {
          try {
            if (
              !editing.closeOnSuccess &&
              committedRow !== undefined &&
              committedSignal !== undefined
            ) {
              const signal = committedSignal;
              try {
                const nextOriginal = await readHostRecord(host, committedTarget, signal);
                await updateRetainedForm(nextOriginal);
              } catch (rawError: unknown) {
                let operationError = normalizeOperationError(
                  rawError,
                  signal,
                  this.arguments_.language,
                );
                if (operationError instanceof InternalOperationAbort) {
                  return;
                }
                try {
                  await updateRetainedForm(committedRow);
                } catch (fallbackError: unknown) {
                  operationError = normalizeOperationError(
                    fallbackError,
                    signal,
                    this.arguments_.language,
                  );
                  if (operationError instanceof InternalOperationAbort) {
                    return;
                  }
                }
                errorReporter.report(
                  operationError,
                  {
                    committed: true,
                    mode: 'dialog',
                    operation: 'edit',
                    phase: 'commit',
                    target,
                  },
                  false,
                );
              }
            }
            await presentation.completeSuccess();
          } finally {
            this.arguments_.onPresentationComplete();
          }
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
          const validationResult = await form.validateForSubmission(
            signal,
            options.validateForm,
            {
              mode: 'dialog',
              operation: 'edit',
            },
          );
          signal.throwIfAborted();
          if (!validationResult.valid) {
            return {
              error: validationResult.error,
              valid: false,
            };
          }
          return {
            changedFields: [
              ...validationResult.fieldValues.keys(),
            ] as FieldPath<TFormValues>[],
            collectedFieldValues: validationResult.fieldValues,
            valid: true,
            values: validationResult.values,
          };
        },
      },
      reportError: (error, context, publishEvent) => {
        errorReporter.report(error, context, publishEvent);
      },
      revalidateTarget: async (signal) => {
        await readHostRecord(host, recordTarget, signal);
      },
      target,
    });
  }
}
