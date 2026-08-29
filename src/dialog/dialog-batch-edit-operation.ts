import {
  EditorConfigurationError,
  type AltEditorLiteError,
} from '../core/alt-editor-lite-error.js';
import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { settleWithAbort } from '../core/settle-with-abort.js';
import { hasHostBatchUpdateCapability } from '../host/editor-host.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { BatchEditOperationRunner } from '../core/editing/batch-edit-operation-runner.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { ResolvedDialogEditingOptions } from '../core/resolve-editing-options.js';
import type { BatchEditorFormController } from '../form/batch-editor-form-controller.js';
import type { EditorHost } from '../host/editor-host.js';

/** Dialog presentation callbacks used by the batch edit operation. */
export interface DialogBatchEditPresentation<TRow extends object> {
  startValidation(): void;
  restoreAfterValidationFailure(): void;
  restoreAfterOperationFailure(): void;
  setBusy(isBusy: boolean): void;
  showOperationError(error: AltEditorLiteError): void;
  completeUnchanged(): Promise<void>;
  completeSuccess(rows: readonly Readonly<TRow>[]): Promise<void>;
}

export interface DialogBatchEditOperationArguments<
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
  readonly batchEditOperationRunner: BatchEditOperationRunner<TRow, TFormValues>;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly onPresentationComplete: () => void;
}

/** Runs one batch edit transaction for the dialog presentation. */
export class DialogBatchEditOperation<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  public constructor(
    private readonly arguments_: DialogBatchEditOperationArguments<
      TRow,
      TFormValues,
      TTarget
    >,
  ) {}

  /** Validates, persists, and commits a common change set. */
  public async run(
    form: BatchEditorFormController<TFormValues>,
    recordTargets: readonly TTarget[],
    originals: readonly Readonly<TRow>[],
    targets: readonly Readonly<EditorOperationTarget>[],
    presentation: DialogBatchEditPresentation<TRow>,
    updateOriginals: (originals: readonly Readonly<TRow>[]) => void,
  ): Promise<void> {
    const {
      batchEditOperationRunner,
      editing,
      editor,
      errorReporter,
      eventTarget,
      host,
      options,
    } = this.arguments_;
    let committedSignal: AbortSignal | undefined;

    await batchEditOperationRunner.run({
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
                options.hooks?.beforeSubmit?.(transaction.changes, context),
              );
              return shouldContinue !== false;
            },
          }),
      commit: async (rows, request) => {
        committedSignal = request.abortController.signal;
        if (!hasHostBatchUpdateCapability<TRow, TTarget>(host)) {
          throw new EditorConfigurationError(
            'The configured Host cannot apply batch updates.',
          );
        }
        await host.applyUpdates(
          rows.map((row, index) => ({
            row,
            target: recordTargets[index] as TTarget,
          })),
          {
            mode: 'dialog',
            operation: 'batchEdit',
            signal: request.abortController.signal,
          },
        );
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          eventTarget,
          'alteditor-lite:submit',
          {
            changes: transaction.changes,
            editor,
            mode: 'dialog',
            operation: 'batchEdit',
            originals: transaction.originals,
            targets: transaction.targets,
            type: 'submit',
          },
        );
      },
      dispatchSuccess: (transaction, result) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
          eventTarget,
          'alteditor-lite:success',
          {
            changes: transaction.changes,
            editor,
            mode: 'dialog',
            operation: 'batchEdit',
            originals: transaction.originals,
            rows: result.rows,
            targets: transaction.targets,
            type: 'success',
          },
        );
      },
      originals,
      presentation: {
        completeSuccess: async (result) => {
          if (!editing.closeOnSuccess && committedSignal !== undefined) {
            const signal = committedSignal;
            try {
              const nextOriginals = await Promise.all(
                recordTargets.map(
                  async (recordTarget) =>
                    await settleWithAbort(host.read(recordTarget, { signal }), signal),
                ),
              );
              signal.throwIfAborted();
              updateOriginals(nextOriginals);
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
                updateOriginals(result.rows);
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
                  operation: 'batchEdit',
                  phase: 'commit',
                  targets,
                },
                false,
              );
            }
          }
          await presentation.completeSuccess(result.rows);
          this.arguments_.onPresentationComplete();
        },
        completeUnchanged: async () => {
          await presentation.completeUnchanged();
          this.arguments_.onPresentationComplete();
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
        validate: async (signal) => await form.validateForSubmission(signal),
      },
      recordTargets,
      reportError: (error, context, publishEvent) => {
        errorReporter.report(error, context, publishEvent);
      },
      revalidateTargets: async (signal) => {
        await Promise.all(
          recordTargets.map(
            async (recordTarget) =>
              await settleWithAbort(host.read(recordTarget, { signal }), signal),
          ),
        );
        signal.throwIfAborted();
      },
      targets,
    });
  }
}
