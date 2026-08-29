import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorOperationBusyError,
  EditorSelectionCountError,
  EditorSelectionUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { dispatchEditorEvent, type EditorCloseReason } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  NEVER_ABORTED_SIGNAL,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { resolveFieldCapabilities } from '../fields/field-capabilities.js';
import { BatchEditorFormController } from '../form/batch-editor-form-controller.js';
import { buildEditorForm } from '../form/build-editor-form.js';
import { hasHostSelectionCapability } from '../host/editor-host.js';
import { readHostRecords } from '../host/host-record-reader.js';

import { createRemoveConfirmation } from './create-remove-confirmation.js';
import {
  DialogBatchEditOperation,
  type DialogBatchEditPresentation,
} from './dialog-batch-edit-operation.js';
import {
  DialogCreateOperation,
  type DialogCreatePresentation,
} from './dialog-create-operation.js';
import {
  DialogEditOperation,
  type DialogEditPresentation,
} from './dialog-edit-operation.js';
import {
  DialogRemoveOperation,
  type DialogRemovePresentation,
} from './dialog-remove-operation.js';
import { EditorDialog } from './editor-dialog.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeOpenContext,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { BatchEditOperationRunner } from '../core/editing/batch-edit-operation-runner.js';
import type { EditOperationRunner } from '../core/editing/edit-operation-runner.js';
import type {
  InteractionCoordinator,
  InteractionToken,
} from '../core/editing/interaction-coordinator.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { DialogAction, EditorOperationTarget } from '../core/editor-operation.js';
import type { EditorStateCoordinator } from '../core/editor-state-coordinator.js';
import type { LocalUniquenessValidator } from '../core/local-uniqueness-validator.js';
import type { ResolvedDialogEditingOptions } from '../core/resolve-editing-options.js';
import type { FieldController } from '../fields/field-controller.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { EditorHost } from '../host/editor-host.js';
import type { InlineHostRuntime } from '../host/inline-host-runtime.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';

export interface DialogEditingControllerArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly editing: Readonly<ResolvedDialogEditingOptions>;
  readonly capabilities: Readonly<EditorCapabilities>;
  readonly instanceId: string;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly stateCoordinator: EditorStateCoordinator;
  readonly interactionCoordinator: InteractionCoordinator;
  readonly operationOwner: OperationOwner;
  readonly host: EditorHost<TRow, TTarget>;
  readonly notifyIntegration: () => void;
  readonly onPresentationComplete: () => void;
  readonly batchEditOperationRunner: BatchEditOperationRunner<TRow, TFormValues>;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly inlineController: InlineHostRuntime;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly uniquenessValidator: LocalUniquenessValidator<TRow, TFormValues, TTarget>;
}

function normalizeRejectedReason(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('AltEditorLite dialog operation failed with a non-Error value.', {
        cause: error,
      });
}

/** Owns dialog presentation, target captures, forms, and submission routing. */
export class DialogEditingController<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  private readonly dialog: EditorDialog;

  private readonly createOperation: DialogCreateOperation<TRow, TFormValues, TTarget>;

  private readonly editOperation: DialogEditOperation<TRow, TFormValues, TTarget>;

  private readonly batchEditOperation: DialogBatchEditOperation<
    TRow,
    TFormValues,
    TTarget
  >;

  private readonly removeOperation: DialogRemoveOperation<TRow, TFormValues, TTarget>;

  private activeForm: EditorFormController<TFormValues> | undefined;

  private activeBatchForm: BatchEditorFormController<TFormValues> | undefined;

  private interactionToken: InteractionToken | undefined;

  private activeOpenAbortController: AbortController | undefined;

  private editTarget: TTarget | undefined;

  private editOriginal: Readonly<TRow> | undefined;

  private batchTargets: readonly TTarget[] | undefined;

  private batchOriginals: readonly Readonly<TRow>[] | undefined;

  private batchOperationTargets: readonly Readonly<EditorOperationTarget>[] | undefined;

  private removeTargets: readonly TTarget[] | undefined;

  private removeOriginals: readonly Readonly<TRow>[] | undefined;

  public constructor(
    private readonly arguments_: DialogEditingControllerArguments<
      TRow,
      TFormValues,
      TTarget
    >,
  ) {
    const focusTarget =
      arguments_.host.eventTarget instanceof HTMLElement
        ? arguments_.host.eventTarget
        : document.body;
    this.dialog = new EditorDialog(
      focusTarget,
      arguments_.instanceId,
      arguments_.language,
    );
    const sharedOperationArguments = {
      editor: arguments_.editor,
      errorReporter: arguments_.errorReporter,
      eventTarget: arguments_.host.eventTarget,
      host: arguments_.host,
      language: arguments_.language,
      operationOwner: arguments_.operationOwner,
      options: arguments_.options,
      onPresentationComplete: arguments_.onPresentationComplete,
    };
    this.createOperation = new DialogCreateOperation(sharedOperationArguments);
    this.batchEditOperation = new DialogBatchEditOperation({
      batchEditOperationRunner: arguments_.batchEditOperationRunner,
      editing: arguments_.editing,
      editor: arguments_.editor,
      errorReporter: arguments_.errorReporter,
      eventTarget: arguments_.host.eventTarget,
      host: arguments_.host,
      language: arguments_.language,
      onPresentationComplete: arguments_.onPresentationComplete,
      options: arguments_.options,
    });
    this.editOperation = new DialogEditOperation({
      editing: arguments_.editing,
      editor: arguments_.editor,
      editOperationRunner: arguments_.editOperationRunner,
      errorReporter: arguments_.errorReporter,
      eventTarget: arguments_.host.eventTarget,
      host: arguments_.host,
      language: arguments_.language,
      onPresentationComplete: arguments_.onPresentationComplete,
      options: arguments_.options,
    });
    this.removeOperation = new DialogRemoveOperation(sharedOperationArguments);
  }

  /** Opens a Create form when a row-construction owner is configured. */
  public async openCreate(): Promise<void> {
    let interactionToken: InteractionToken | undefined;
    let openAbortController: AbortController | undefined;
    try {
      this.arguments_.stateCoordinator.assertActive();
      if (!this.arguments_.capabilities.createDialog) {
        throw new EditorConfigurationError(
          'Create requires operations.create or clientSide.createRow.',
        );
      }
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      interactionToken = this.acquireInteraction();
      openAbortController = this.beginOpenRequest();
      if (!(await this.runBeforeOpen('create', openAbortController.signal))) {
        this.releaseInteraction(interactionToken);
        return;
      }
      this.assertCurrentOpenRequest(openAbortController);
      await this.openForm('create');
    } catch (error: unknown) {
      if (interactionToken !== undefined) {
        this.releaseInteraction(interactionToken);
      }
      if (openAbortController?.signal.aborted === true) {
        this.arguments_.stateCoordinator.assertActive();
        return;
      }
      throw normalizeRejectedReason(error);
    } finally {
      this.completeOpenRequest(openAbortController);
    }
  }

  /** Opens Dialog Edit for one explicit or selected row. */
  public async openEdit(target?: TTarget): Promise<void> {
    let interactionToken: InteractionToken | undefined;
    let openAbortController: AbortController | undefined;
    try {
      this.arguments_.stateCoordinator.assertActive();
      if (!this.arguments_.capabilities.editDialog) {
        throw new EditorConfigurationError(
          'Dialog Edit is disabled by editing.dialog.enabled.',
        );
      }
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      interactionToken = this.acquireInteraction();
      openAbortController = this.beginOpenRequest();
      const targets = this.resolveRequestedTargets(
        target === undefined ? undefined : [target],
      );
      const recordTarget = targets[0];
      if (targets.length !== 1 || recordTarget === undefined) {
        throw new EditorSelectionCountError(
          'exactly-one',
          targets.length,
          this.arguments_.language.errors.singleSelectionRequired,
        );
      }

      const operationTarget = this.createEditOperationTarget(recordTarget);
      const originals = await this.readRecordsForOpen(
        [recordTarget],
        openAbortController,
        {
          committed: false,
          mode: 'dialog',
          operation: 'edit',
          phase: 'open',
          target: operationTarget,
        },
      );
      const original = originals[0];
      if (original === undefined) {
        throw new EditorConfigurationError('Host read did not return the requested row.');
      }
      if (
        !(await this.runBeforeOpen(
          'edit',
          original,
          operationTarget,
          openAbortController.signal,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = await this.readRecordsForOpen(
        [recordTarget],
        openAbortController,
        {
          committed: false,
          mode: 'dialog',
          operation: 'edit',
          phase: 'open',
          target: operationTarget,
        },
      );
      const currentOriginal = currentOriginals[0];
      if (currentOriginal === undefined) {
        throw new EditorConfigurationError('Host read did not return the requested row.');
      }
      this.assertCurrentOpenRequest(openAbortController);
      this.editTarget = recordTarget;
      this.editOriginal = currentOriginal;
      try {
        await this.openForm('edit', currentOriginal);
      } catch (error: unknown) {
        this.editTarget = undefined;
        this.editOriginal = undefined;
        throw error;
      }
    } catch (error: unknown) {
      if (interactionToken !== undefined) {
        this.releaseInteraction(interactionToken);
      }
      if (openAbortController?.signal.aborted === true) {
        this.arguments_.stateCoordinator.assertActive();
        return;
      }
      throw normalizeRejectedReason(error);
    } finally {
      this.completeOpenRequest(openAbortController);
    }
  }

  /** Opens Dialog Edit for two or more explicit or selected rows. */
  public async openBatchEdit(targets?: readonly TTarget[]): Promise<void> {
    let interactionToken: InteractionToken | undefined;
    let openAbortController: AbortController | undefined;
    try {
      this.arguments_.stateCoordinator.assertActive();
      if (targets !== undefined && targets.length < 2) {
        throw new EditorSelectionCountError(
          'at-least-two',
          targets.length,
          this.arguments_.language.batchEdit.selectionRequired,
        );
      }
      if (!this.arguments_.capabilities.batchEditDialog) {
        throw new EditorConfigurationError(
          this.arguments_.language.buttons.batchEditUnavailable,
        );
      }
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      interactionToken = this.acquireInteraction();
      openAbortController = this.beginOpenRequest();
      const requestedTargets = this.resolveRequestedTargets(targets);
      if (requestedTargets.length < 2) {
        throw new EditorSelectionCountError(
          'at-least-two',
          requestedTargets.length,
          this.arguments_.language.batchEdit.selectionRequired,
        );
      }
      if (new Set(requestedTargets).size !== requestedTargets.length) {
        throw new EditorConfigurationError('Batch Edit targets must be distinct.');
      }

      const operationTargets = Object.freeze(
        requestedTargets.map((recordTarget) =>
          this.createBatchEditOperationTarget(recordTarget),
        ),
      );
      const originals = Object.freeze(
        await this.readRecordsForOpen(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'batchEdit',
          phase: 'open',
          targets: operationTargets,
        }),
      );
      if (
        !(await this.runBeforeOpen(
          'batchEdit',
          originals,
          operationTargets,
          openAbortController.signal,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = Object.freeze(
        await this.readRecordsForOpen(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'batchEdit',
          phase: 'open',
          targets: operationTargets,
        }),
      );
      this.assertCurrentOpenRequest(openAbortController);
      this.batchTargets = Object.freeze([...requestedTargets]);
      this.batchOriginals = currentOriginals;
      this.batchOperationTargets = operationTargets;
      await this.openBatchForm(currentOriginals);
    } catch (error: unknown) {
      if (this.interactionToken === interactionToken) {
        this.clearBatchTargets();
      }
      if (interactionToken !== undefined) {
        this.releaseInteraction(interactionToken);
      }
      if (openAbortController?.signal.aborted === true) {
        this.arguments_.stateCoordinator.assertActive();
        return;
      }
      throw normalizeRejectedReason(error);
    } finally {
      this.completeOpenRequest(openAbortController);
    }
  }

  /** Opens mandatory Remove confirmation for explicit or selected rows. */
  public async openRemove(targets?: readonly TTarget[]): Promise<void> {
    let interactionToken: InteractionToken | undefined;
    let openAbortController: AbortController | undefined;
    try {
      this.arguments_.stateCoordinator.assertActive();
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      interactionToken = this.acquireInteraction();
      openAbortController = this.beginOpenRequest();
      const requestedTargets = this.resolveRequestedTargets(targets);
      if (requestedTargets.length === 0) {
        throw new EditorSelectionCountError(
          'one-or-more',
          0,
          this.arguments_.language.errors.selectionRequired,
        );
      }

      const operationTargets = requestedTargets.map((recordTarget) =>
        this.createEditOperationTarget(recordTarget),
      );
      const originals = Object.freeze(
        await this.readRecordsForOpen(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'remove',
          phase: 'open',
        }),
      );
      if (
        !(await this.runBeforeOpen(
          'remove',
          originals,
          operationTargets,
          openAbortController.signal,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = Object.freeze(
        await this.readRecordsForOpen(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'remove',
          phase: 'open',
        }),
      );
      this.assertCurrentOpenRequest(openAbortController);
      this.removeTargets = Object.freeze([...requestedTargets]);
      this.removeOriginals = currentOriginals;
      this.arguments_.stateCoordinator.transitionTo({
        action: 'remove',
        status: 'opening',
      });
      const confirmationElement = createRemoveConfirmation(
        requestedTargets.length,
        this.arguments_.language,
      );
      try {
        this.dialog.openConfirmation(
          confirmationElement,
          this.arguments_.language.dialog.removeTitle,
          this.arguments_.language.actions.remove,
          {
            onRequestClose: (reason) => {
              this.closeNow(reason);
            },
            onSubmit: () => {
              this.beginSubmission();
            },
          },
        );
      } catch (error: unknown) {
        confirmationElement.remove();
        this.removeTargets = undefined;
        this.removeOriginals = undefined;
        this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
        throw error;
      }

      this.arguments_.stateCoordinator.transitionTo({
        action: 'remove',
        status: 'open',
      });
      this.dispatchOpen('remove');
    } catch (error: unknown) {
      if (this.interactionToken === interactionToken) {
        this.removeTargets = undefined;
        this.removeOriginals = undefined;
        const state = this.arguments_.stateCoordinator.getState();
        if (
          (state.status === 'opening' || state.status === 'open') &&
          state.action === 'remove'
        ) {
          try {
            runCleanupSteps([
              () => {
                this.dialog.close();
              },
              () => {
                this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
              },
            ]);
          } catch {
            // Preserve the failure that interrupted opening.
          }
        }
      }
      if (interactionToken !== undefined) {
        this.releaseInteraction(interactionToken);
      }
      if (openAbortController?.signal.aborted === true) {
        this.arguments_.stateCoordinator.assertActive();
        return;
      }
      throw normalizeRejectedReason(error);
    } finally {
      this.completeOpenRequest(openAbortController);
    }
  }

  /** Closes the active dialog or cancels an opening request. */
  public close(): Promise<void> {
    try {
      this.arguments_.stateCoordinator.assertActive();
      this.closeNow('api');
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Returns a field facade while an editing form is active. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.arguments_.stateCoordinator.assertActive();
    return (
      this.activeForm?.getField(name) ?? this.activeBatchForm?.getField(name) ?? null
    );
  }

  /** Aborts opening and submission work and removes all dialog-owned DOM. */
  public destroy(): void {
    const activeForm = this.activeForm;
    const activeBatchForm = this.activeBatchForm;
    this.activeForm = undefined;
    this.activeBatchForm = undefined;
    this.editTarget = undefined;
    this.editOriginal = undefined;
    this.clearBatchTargets();
    this.removeTargets = undefined;
    this.removeOriginals = undefined;
    runCleanupSteps([
      () => {
        this.activeOpenAbortController?.abort();
      },
      () => {
        this.arguments_.operationOwner.abort('dialog');
      },
      () => {
        activeForm?.destroy();
      },
      () => {
        activeBatchForm?.destroy();
      },
      () => {
        this.releaseInteraction();
      },
      () => {
        this.dialog.destroy();
      },
    ]);
  }

  private assertReady(): void {
    if (
      this.arguments_.stateCoordinator.getState().status !== 'ready' ||
      this.arguments_.interactionCoordinator.current() !== 'none'
    ) {
      throw new EditorOperationBusyError();
    }
  }

  private acquireInteraction(): InteractionToken {
    const token = this.arguments_.interactionCoordinator.acquire('dialog');
    this.interactionToken = token;
    this.notifyIntegration();
    return token;
  }

  private releaseInteraction(token = this.interactionToken): void {
    if (token !== undefined && this.interactionToken === token) {
      this.arguments_.interactionCoordinator.release(token);
      this.interactionToken = undefined;
      this.notifyIntegration();
    }
  }

  private beginOpenRequest(): AbortController {
    this.activeOpenAbortController?.abort();
    const abortController = new AbortController();
    this.activeOpenAbortController = abortController;
    return abortController;
  }

  private completeOpenRequest(abortController: AbortController | undefined): void {
    if (this.activeOpenAbortController === abortController) {
      this.activeOpenAbortController = undefined;
    }
  }

  private assertCurrentOpenRequest(abortController: AbortController): void {
    if (
      this.activeOpenAbortController !== abortController ||
      abortController.signal.aborted
    ) {
      throw new DOMException('The open request was cancelled.', 'AbortError');
    }
  }

  private async readRecordsForOpen(
    targets: readonly TTarget[],
    abortController: AbortController,
    errorContext: EditorErrorHookContext,
  ): Promise<readonly Readonly<TRow>[]> {
    const { signal } = abortController;
    try {
      const rows = await readHostRecords(this.arguments_.host, targets, signal);
      this.assertCurrentOpenRequest(abortController);
      return rows.map((row) => createReadonlyRowView<TRow>(row));
    } catch (rawError: unknown) {
      const error = normalizeOperationError(rawError, signal, this.arguments_.language);
      if (!(error instanceof InternalOperationAbort)) {
        this.arguments_.errorReporter.report(error, errorContext, true);
      }
      throw error;
    }
  }

  private runBeforeOpen(operation: 'create', signal: AbortSignal): Promise<boolean>;
  private runBeforeOpen(
    operation: 'edit',
    row: Readonly<TRow>,
    target: Readonly<EditorOperationTarget>,
    signal: AbortSignal,
  ): Promise<boolean>;
  private runBeforeOpen(
    operation: 'batchEdit' | 'remove',
    rows: readonly Readonly<TRow>[],
    targets: readonly Readonly<EditorOperationTarget>[],
    signal: AbortSignal,
  ): Promise<boolean>;
  private async runBeforeOpen(
    operation: 'create' | 'edit' | 'batchEdit' | 'remove',
    rowOrRowsOrSignal?: Readonly<TRow> | readonly Readonly<TRow>[] | AbortSignal,
    targetOrTargets?:
      | Readonly<EditorOperationTarget>
      | readonly Readonly<EditorOperationTarget>[]
      | AbortSignal,
    operationSignal?: AbortSignal,
  ): Promise<boolean> {
    const hook = this.arguments_.options.hooks?.beforeOpen;
    if (hook === undefined) {
      return true;
    }

    const signal: AbortSignal | undefined =
      operation === 'create' ? (rowOrRowsOrSignal as AbortSignal) : operationSignal;
    if (signal === undefined) {
      throw new EditorConfigurationError('The open request requires a signal.');
    }
    let context: BeforeOpenContext<TRow, TFormValues>;
    let errorContext: import('../core/alt-editor-lite-options.js').EditorErrorHookContext;
    if (operation === 'edit') {
      const row = rowOrRowsOrSignal as Readonly<TRow>;
      const target = targetOrTargets as Readonly<EditorOperationTarget>;
      context = Object.freeze({
        mode: 'dialog',
        operation,
        row,
        signal,
        target,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
        target,
      };
    } else if (operation === 'batchEdit') {
      const originals = rowOrRowsOrSignal as readonly Readonly<TRow>[];
      const targets = targetOrTargets as readonly Readonly<EditorOperationTarget>[];
      context = Object.freeze({
        mode: 'dialog',
        operation,
        originals,
        signal,
        targets,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
        targets,
      };
    } else if (operation === 'remove') {
      const rows = rowOrRowsOrSignal as readonly Readonly<TRow>[];
      const targets = targetOrTargets as readonly Readonly<EditorOperationTarget>[];
      context = Object.freeze({
        mode: 'dialog',
        operation,
        rows,
        signal,
        targets,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
      };
    } else {
      context = Object.freeze({
        mode: 'dialog',
        operation,
        signal,
      });
      errorContext = {
        committed: false,
        mode: 'dialog',
        operation,
        phase: 'open',
      };
    }
    try {
      const shouldOpen = await Promise.resolve(hook(context));
      signal.throwIfAborted();
      return shouldOpen !== false;
    } catch (rawError: unknown) {
      const error = normalizeOperationError(rawError, signal, this.arguments_.language);
      if (error instanceof InternalOperationAbort) {
        return false;
      }
      this.arguments_.errorReporter.report(error, errorContext, true);
      throw error;
    }
  }

  private resolveRequestedTargets(
    targets: readonly TTarget[] | undefined,
  ): readonly TTarget[] {
    if (targets !== undefined) {
      return targets;
    }
    if (!hasHostSelectionCapability<TTarget>(this.arguments_.host)) {
      throw new EditorSelectionUnavailableError(
        this.arguments_.language.buttons.selectUnavailable,
      );
    }
    return this.arguments_.host.getSelectedTargets(
      this.arguments_.language.buttons.selectUnavailable,
    );
  }

  private async openForm(
    action: 'create' | 'edit',
    sourceValues?: Readonly<object>,
  ): Promise<void> {
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'opening' });
    let form: EditorFormController<TFormValues> | undefined;
    try {
      form = buildEditorForm(
        this.arguments_.options.fields,
        this.arguments_.instanceId,
        this.arguments_.language,
        (values) =>
          this.arguments_.uniquenessValidator.validate(
            values,
            action === 'edit' && this.editTarget !== undefined
              ? { target: this.editTarget }
              : undefined,
          ),
        this.arguments_.editing.template,
        this.arguments_.options.dependencies,
        (_sourcePath, error) => {
          const phase =
            this.arguments_.stateCoordinator.getState().status === 'opening'
              ? 'open'
              : 'validation';
          if (action === 'edit' && this.editTarget !== undefined) {
            this.arguments_.errorReporter.report(
              error,
              {
                committed: false,
                mode: 'dialog',
                operation: 'edit',
                phase,
                target: this.createEditOperationTarget(this.editTarget),
              },
              true,
            );
          } else {
            this.arguments_.errorReporter.report(
              error,
              {
                committed: false,
                mode: 'dialog',
                operation: 'create',
                phase,
              },
              true,
            );
          }
        },
      );
      this.activeForm = form;
      if (sourceValues !== undefined) {
        form.populateFromSource(sourceValues);
      }
      await form.initializeDependencies();
      this.arguments_.stateCoordinator.assertActive();
      this.dialog.openForm(
        form.element,
        action === 'create'
          ? this.arguments_.language.dialog.createTitle
          : this.arguments_.language.dialog.editTitle,
        this.arguments_.language.actions.submit,
        {
          onRequestClose: (reason) => {
            this.closeNow(reason);
          },
          onSubmit: () => {
            this.beginSubmission();
          },
        },
      );
    } catch (rawError: unknown) {
      this.dialog.close();
      form?.destroy();
      this.activeForm = undefined;
      if (this.arguments_.stateCoordinator.getState().status === 'destroyed') {
        throw rawError;
      }
      this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
      const normalizedError = normalizeOperationError(
        rawError,
        NEVER_ABORTED_SIGNAL,
        this.arguments_.language,
      );
      const openingError =
        normalizedError instanceof InternalOperationAbort
          ? new AltEditorLiteError({
              cause: rawError,
              code: 'UNKNOWN',
              message: this.arguments_.language.errors.generic,
              retryable: false,
            })
          : normalizedError;
      if (action === 'edit' && this.editTarget !== undefined) {
        this.arguments_.errorReporter.report(
          openingError,
          {
            committed: false,
            mode: 'dialog',
            operation: 'edit',
            phase: 'open',
            target: this.createEditOperationTarget(this.editTarget),
          },
          true,
        );
      } else {
        this.arguments_.errorReporter.report(
          openingError,
          {
            committed: false,
            mode: 'dialog',
            operation: 'create',
            phase: 'open',
          },
          true,
        );
      }
      throw rawError;
    }

    this.arguments_.stateCoordinator.transitionTo({ action, status: 'open' });
    this.dispatchOpen(action);
  }

  private async openBatchForm(originals: readonly Readonly<TRow>[]): Promise<void> {
    this.arguments_.stateCoordinator.transitionTo({
      action: 'batchEdit',
      status: 'opening',
    });
    let form: BatchEditorFormController<TFormValues> | undefined;
    try {
      form = new BatchEditorFormController(
        this.arguments_.options.fields,
        originals,
        this.arguments_.instanceId,
        this.arguments_.language,
        this.arguments_.editing.template,
        this.arguments_.options.validateForm,
        this.arguments_.options.dependencies,
        (_sourcePath, error) => {
          this.arguments_.errorReporter.report(
            error,
            {
              committed: false,
              mode: 'dialog',
              operation: 'batchEdit',
              phase:
                this.arguments_.stateCoordinator.getState().status === 'opening'
                  ? 'open'
                  : 'validation',
              targets: this.batchOperationTargets ?? [],
            },
            true,
          );
        },
      );
      this.activeBatchForm = form;
      await form.initializeDependencies();
      this.arguments_.stateCoordinator.assertActive();
      this.dialog.openForm(
        form.element,
        this.arguments_.language.dialog.batchEditTitle,
        this.arguments_.language.actions.submit,
        {
          onRequestClose: (reason) => {
            this.closeNow(reason);
          },
          onSubmit: () => {
            this.beginSubmission();
          },
        },
      );
    } catch (rawError: unknown) {
      this.dialog.close();
      form?.destroy();
      this.activeBatchForm = undefined;
      if (this.arguments_.stateCoordinator.getState().status === 'destroyed') {
        throw rawError;
      }
      this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
      const normalizedError = normalizeOperationError(
        rawError,
        NEVER_ABORTED_SIGNAL,
        this.arguments_.language,
      );
      const openingError =
        normalizedError instanceof InternalOperationAbort
          ? new AltEditorLiteError({
              cause: rawError,
              code: 'UNKNOWN',
              message: this.arguments_.language.errors.generic,
              retryable: false,
            })
          : normalizedError;
      this.arguments_.errorReporter.report(
        openingError,
        {
          committed: false,
          mode: 'dialog',
          operation: 'batchEdit',
          phase: 'open',
          targets: this.batchOperationTargets ?? [],
        },
        true,
      );
      throw rawError;
    }

    this.arguments_.stateCoordinator.transitionTo({
      action: 'batchEdit',
      status: 'open',
    });
    this.dispatchOpen('batchEdit');
  }

  private dispatchOpen(operation: DialogAction): void {
    const detail =
      operation === 'batchEdit' &&
      this.batchOriginals !== undefined &&
      this.batchOperationTargets !== undefined
        ? {
            editor: this.arguments_.editor,
            mode: 'dialog' as const,
            operation: 'batchEdit' as const,
            originals: this.batchOriginals,
            targets: this.batchOperationTargets,
            type: 'open' as const,
          }
        : operation === 'edit' && this.editTarget !== undefined
          ? {
              editor: this.arguments_.editor,
              mode: 'dialog' as const,
              operation: 'edit' as const,
              target: this.createEditOperationTarget(this.editTarget),
              type: 'open' as const,
            }
          : {
              editor: this.arguments_.editor,
              mode: 'dialog' as const,
              operation:
                operation === 'remove' ? ('remove' as const) : ('create' as const),
              type: 'open' as const,
            };
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
      this.arguments_.host.eventTarget,
      'alteditor-lite:open',
      detail,
    );
  }

  private beginSubmission(): void {
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status !== 'open') {
      return;
    }
    switch (state.action) {
      case 'create': {
        if (this.activeForm !== undefined) {
          this.observeSubmission(
            this.createOperation.run(this.activeForm, this.createPresentation()),
          );
        }
        break;
      }
      case 'edit': {
        if (
          this.activeForm !== undefined &&
          this.editTarget !== undefined &&
          this.editOriginal !== undefined
        ) {
          const form = this.activeForm;
          const recordTarget = this.editTarget;
          this.observeSubmission(
            this.editOperation.run(
              form,
              recordTarget,
              this.editOriginal,
              this.createEditOperationTarget(recordTarget),
              this.editPresentation(form),
              (nextTarget) => {
                this.editTarget = nextTarget;
              },
              async (nextOriginal) => {
                const snapshot = createReadonlyRowView<TRow>(nextOriginal);
                this.editOriginal = snapshot;
                form.populateFromSource(snapshot);
                await form.initializeDependencies();
              },
            ),
          );
        }
        break;
      }
      case 'remove': {
        if (this.removeTargets !== undefined && this.removeOriginals !== undefined) {
          this.observeSubmission(
            this.removeOperation.run(
              this.removeTargets,
              this.removeOriginals,
              this.removePresentation(),
            ),
          );
        }
        break;
      }
      case 'batchEdit': {
        if (
          this.activeBatchForm !== undefined &&
          this.batchTargets !== undefined &&
          this.batchOriginals !== undefined &&
          this.batchOperationTargets !== undefined
        ) {
          const form = this.activeBatchForm;
          this.observeSubmission(
            this.batchEditOperation.run(
              form,
              this.batchTargets,
              this.batchOriginals,
              this.batchOperationTargets,
              this.batchEditPresentation(form),
              (nextOriginals) => {
                this.batchOriginals = Object.freeze(
                  nextOriginals.map((row) => createReadonlyRowView<TRow>(row)),
                );
              },
            ),
          );
        }
        break;
      }
    }
  }

  private observeSubmission(request: Promise<void>): void {
    void request.catch((error: unknown) => {
      console.error(
        'AltEditorLite could not complete dialog result handling.',
        normalizeRejectedReason(error),
      );
    });
  }

  private createPresentation(): DialogCreatePresentation<TFormValues> {
    return {
      completeSuccess: (form) => {
        this.completeFormSuccess('create', form);
      },
      restoreAfterAbort: (form) => {
        this.restoreOpen('create', form);
      },
      restoreAfterValidation: (form) => {
        this.restoreOpen('create', form, true);
      },
      showOperationError: (form, error) => {
        this.showOperationError('create', error, form);
      },
      startSubmission: () => {
        this.setSubmitting('create');
      },
    };
  }

  private editPresentation(
    form: EditorFormController<TFormValues>,
  ): DialogEditPresentation {
    return {
      completeSuccess: () => {
        this.completeFormSuccess('edit', form);
      },
      restoreAfterOperationFailure: () => undefined,
      restoreAfterValidationFailure: () => {
        this.restoreOpen('edit', form, true);
      },
      setBusy: (isBusy) => {
        form.setBusy(isBusy);
        this.dialog.setBusy(isBusy);
      },
      showOperationError: (error) => {
        this.showOperationError('edit', error, form);
      },
      startValidation: () => {
        this.setSubmitting('edit');
      },
    };
  }

  private batchEditPresentation(
    form: BatchEditorFormController<TFormValues>,
  ): DialogBatchEditPresentation<TRow> {
    return {
      completeSuccess: () => {
        if (this.arguments_.editing.closeOnSuccess) {
          this.closeAfterSuccess('batchEdit');
        } else {
          if (this.batchOriginals !== undefined) {
            form.rebase(this.batchOriginals);
          }
          this.restoreBatchOpen(form);
        }
        return Promise.resolve();
      },
      completeUnchanged: () => {
        this.closeAfterResult('batchEdit', 'unchanged');
        return Promise.resolve();
      },
      restoreAfterOperationFailure: () => undefined,
      restoreAfterValidationFailure: () => {
        this.restoreBatchOpen(form, true);
      },
      setBusy: (isBusy) => {
        form.setBusy(isBusy);
        this.dialog.setBusy(isBusy);
      },
      showOperationError: (error) => {
        this.showBatchOperationError(error, form);
      },
      startValidation: () => {
        this.setSubmitting('batchEdit');
      },
    };
  }

  private removePresentation(): DialogRemovePresentation {
    return {
      completeSuccess: () => {
        this.closeAfterSuccess('remove');
      },
      restoreAfterAbort: () => {
        this.restoreRemoveOpen();
      },
      showOperationError: (error) => {
        this.showOperationError('remove', error);
      },
      startSubmission: () => {
        this.setSubmitting('remove');
      },
    };
  }

  private setSubmitting(action: DialogAction): void {
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'submitting' });
    this.activeForm?.setBusy(true);
    this.activeBatchForm?.setBusy(true);
    this.dialog.setSubmitAvailable(true);
    this.dialog.setBusy(true);
    this.activeForm?.clearErrors();
    this.activeBatchForm?.clearErrors();
    this.dialog.clearError();
  }

  private restoreOpen(
    action: 'create' | 'edit',
    form: EditorFormController<TFormValues>,
    focusInvalid = false,
  ): void {
    form.setBusy(false);
    this.dialog.setBusy(false);
    this.dialog.setSubmitAvailable(true);
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'open' });
    if (focusInvalid) {
      this.dialog.focusInvalidField();
    }
  }

  private restoreRemoveOpen(): void {
    this.dialog.setBusy(false);
    this.dialog.setSubmitAvailable(true);
    this.arguments_.stateCoordinator.transitionTo({
      action: 'remove',
      status: 'open',
    });
  }

  private restoreBatchOpen(
    form: BatchEditorFormController<TFormValues>,
    focusInvalid = false,
  ): void {
    form.setBusy(false);
    this.dialog.setBusy(false);
    this.dialog.setSubmitAvailable(true);
    this.arguments_.stateCoordinator.transitionTo({
      action: 'batchEdit',
      status: 'open',
    });
    if (focusInvalid) {
      this.dialog.focusInvalidField();
    }
  }

  private showOperationError(
    action: 'create' | 'edit' | 'remove',
    error: AltEditorLiteError,
    form?: EditorFormController<TFormValues>,
  ): void {
    form?.setBusy(false);
    this.dialog.setBusy(false);
    form?.showSubmissionError(error);
    this.dialog.showError(error.message);
    this.dialog.setSubmitAvailable(error.retryable);
    this.arguments_.stateCoordinator.transitionTo({
      action,
      status: 'open',
      submissionError: error,
    });
  }

  private showBatchOperationError(
    error: AltEditorLiteError,
    form: BatchEditorFormController<TFormValues>,
  ): void {
    form.setBusy(false);
    this.dialog.setBusy(false);
    form.showSubmissionError(error);
    this.dialog.showError(error.message);
    this.dialog.setSubmitAvailable(error.retryable);
    this.arguments_.stateCoordinator.transitionTo({
      action: 'batchEdit',
      status: 'open',
      submissionError: error,
    });
  }

  private completeFormSuccess(
    action: 'create' | 'edit',
    form: EditorFormController<TFormValues>,
  ): void {
    if (this.arguments_.editing.closeOnSuccess) {
      this.closeAfterSuccess(action);
    } else {
      this.restoreOpen(action, form);
    }
  }

  private closeAfterSuccess(action: DialogAction): void {
    this.closeAfterResult(action, 'success');
  }

  private closeAfterResult(
    action: DialogAction,
    reason: Extract<EditorCloseReason, 'success' | 'unchanged'>,
  ): void {
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status !== 'submitting' || state.action !== action) {
      throw new EditorOperationBusyError();
    }
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'closing' });
    this.finishClose(action, reason);
  }

  private closeNow(reason: Exclude<EditorCloseReason, 'success'>): void {
    this.arguments_.stateCoordinator.assertActive();
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status === 'ready') {
      if (this.interactionToken !== undefined) {
        this.activeOpenAbortController?.abort();
        this.releaseInteraction();
      }
      return;
    }
    if (state.status !== 'open' && state.status !== 'submitting') {
      throw new EditorOperationBusyError();
    }

    const action = state.action;
    if (state.status === 'submitting') {
      this.arguments_.operationOwner.abort('dialog');
    }
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'closing' });
    this.finishClose(action, reason);
  }

  private finishClose(action: DialogAction, reason: EditorCloseReason): void {
    this.dialog.close();
    this.activeForm?.destroy();
    this.activeBatchForm?.destroy();
    this.activeForm = undefined;
    this.activeBatchForm = undefined;
    const closeTarget =
      action === 'edit' && this.editTarget !== undefined
        ? this.createEditOperationTarget(this.editTarget)
        : undefined;
    const closeBatchTargets =
      action === 'batchEdit' ? this.batchOperationTargets : undefined;
    this.editTarget = undefined;
    this.editOriginal = undefined;
    this.clearBatchTargets();
    this.removeTargets = undefined;
    this.removeOriginals = undefined;
    this.releaseInteraction();
    this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
    const detail =
      action === 'batchEdit' && closeBatchTargets !== undefined
        ? {
            editor: this.arguments_.editor,
            mode: 'dialog' as const,
            operation: 'batchEdit' as const,
            reason,
            targets: closeBatchTargets,
            type: 'close' as const,
          }
        : action === 'edit' && closeTarget !== undefined
          ? {
              editor: this.arguments_.editor,
              mode: 'dialog' as const,
              operation: 'edit' as const,
              reason,
              target: closeTarget,
              type: 'close' as const,
            }
          : {
              editor: this.arguments_.editor,
              mode: 'dialog' as const,
              operation: action === 'remove' ? ('remove' as const) : ('create' as const),
              reason,
              type: 'close' as const,
            };
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
      this.arguments_.host.eventTarget,
      'alteditor-lite:close',
      detail,
    );
  }

  private createEditOperationTarget(target: TTarget): Readonly<EditorOperationTarget> {
    return Object.freeze({
      fieldNames: Object.freeze(
        this.arguments_.options.fields
          .filter(
            (field) => resolveFieldCapabilities(field).dialog && field.disabled !== true,
          )
          .map((field) => field.name),
      ),
      key: target,
    });
  }

  private createBatchEditOperationTarget(
    target: TTarget,
  ): Readonly<EditorOperationTarget> {
    return Object.freeze({
      fieldNames: Object.freeze(
        this.arguments_.options.fields
          .filter(
            (field) =>
              resolveFieldCapabilities(field).batch &&
              field.disabled !== true &&
              field.type !== 'hidden',
          )
          .map((field) => field.name),
      ),
      key: target,
    });
  }

  private clearBatchTargets(): void {
    this.batchTargets = undefined;
    this.batchOriginals = undefined;
    this.batchOperationTargets = undefined;
  }

  private notifyIntegration(): void {
    this.arguments_.notifyIntegration();
  }
}
