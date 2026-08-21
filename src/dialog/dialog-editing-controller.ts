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
import { buildEditorForm } from '../form/build-editor-form.js';
import { hasHostSelectionCapability } from '../host/editor-host.js';

import { createRemoveConfirmation } from './create-remove-confirmation.js';
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
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { EditOperationRunner } from '../core/editing/edit-operation-runner.js';
import type {
  InteractionCoordinator,
  InteractionToken,
} from '../core/editing/interaction-coordinator.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
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

  private readonly removeOperation: DialogRemoveOperation<TRow, TFormValues, TTarget>;

  private activeForm: EditorFormController<TFormValues> | undefined;

  private interactionToken: InteractionToken | undefined;

  private activeOpenAbortController: AbortController | undefined;

  private editTarget: TTarget | undefined;

  private editOriginal: Readonly<TRow> | undefined;

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
    this.editOperation = new DialogEditOperation({
      editing: arguments_.editing,
      editor: arguments_.editor,
      editOperationRunner: arguments_.editOperationRunner,
      errorReporter: arguments_.errorReporter,
      eventTarget: arguments_.host.eventTarget,
      host: arguments_.host,
      onPresentationComplete: arguments_.onPresentationComplete,
      options: arguments_.options,
    });
    this.removeOperation = new DialogRemoveOperation(sharedOperationArguments);
  }

  /** Opens a Create form when a row-construction owner is configured. */
  public async openCreate(): Promise<void> {
    let didAcquireInteraction = false;
    try {
      this.arguments_.stateCoordinator.assertActive();
      if (!this.arguments_.capabilities.createDialog) {
        throw new EditorConfigurationError(
          'Create requires operations.create or clientSide.createRow.',
        );
      }
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      this.acquireInteraction();
      didAcquireInteraction = true;
      if (!(await this.runBeforeOpen('create'))) {
        this.releaseInteraction();
        return;
      }
      await this.openForm('create');
    } catch (error: unknown) {
      if (didAcquireInteraction) {
        this.releaseInteraction();
      }
      throw normalizeRejectedReason(error);
    }
  }

  /** Opens Dialog Edit for one explicit or selected row. */
  public async openEdit(target?: TTarget): Promise<void> {
    let didAcquireInteraction = false;
    try {
      this.arguments_.stateCoordinator.assertActive();
      if (!this.arguments_.capabilities.editDialog) {
        throw new EditorConfigurationError(
          'Dialog Edit is disabled by editing.dialog.enabled.',
        );
      }
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      this.acquireInteraction();
      didAcquireInteraction = true;
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

      this.editTarget = recordTarget;
      this.editOriginal = createReadonlyRowView<TRow>(
        this.arguments_.host.read(recordTarget),
      );
      const operationTarget = this.createEditOperationTarget(recordTarget);
      if (!(await this.runBeforeOpen('edit', this.editOriginal, operationTarget))) {
        this.editTarget = undefined;
        this.editOriginal = undefined;
        this.releaseInteraction();
        return;
      }
      this.arguments_.host.read(recordTarget);
      try {
        await this.openForm('edit', this.editOriginal);
      } catch (error: unknown) {
        this.editTarget = undefined;
        this.editOriginal = undefined;
        throw error;
      }
    } catch (error: unknown) {
      if (didAcquireInteraction) {
        this.releaseInteraction();
      }
      throw normalizeRejectedReason(error);
    }
  }

  /** Opens mandatory Remove confirmation for explicit or selected rows. */
  public async openRemove(targets?: readonly TTarget[]): Promise<void> {
    let didAcquireInteraction = false;
    try {
      this.arguments_.stateCoordinator.assertActive();
      await this.arguments_.inlineController.prepareForExternalOperation();
      this.assertReady();
      this.acquireInteraction();
      didAcquireInteraction = true;
      const requestedTargets = this.resolveRequestedTargets(targets);
      if (requestedTargets.length === 0) {
        throw new EditorSelectionCountError(
          'one-or-more',
          0,
          this.arguments_.language.errors.selectionRequired,
        );
      }

      this.removeTargets = Object.freeze([...requestedTargets]);
      this.removeOriginals = Object.freeze(
        requestedTargets.map((recordTarget) =>
          createReadonlyRowView<TRow>(this.arguments_.host.read(recordTarget)),
        ),
      );
      if (!(await this.runBeforeOpen('remove'))) {
        this.removeTargets = undefined;
        this.removeOriginals = undefined;
        this.releaseInteraction();
        return;
      }
      for (const recordTarget of requestedTargets) {
        this.arguments_.host.read(recordTarget);
      }
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
      if (didAcquireInteraction) {
        this.releaseInteraction();
      }
      throw normalizeRejectedReason(error);
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

  /** Returns a field facade while a Create or Edit form is active. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.arguments_.stateCoordinator.assertActive();
    return this.activeForm?.getField(name) ?? null;
  }

  /** Aborts opening and submission work and removes all dialog-owned DOM. */
  public destroy(): void {
    const activeForm = this.activeForm;
    this.activeForm = undefined;
    this.editTarget = undefined;
    this.editOriginal = undefined;
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

  private acquireInteraction(): void {
    this.interactionToken = this.arguments_.interactionCoordinator.acquire('dialog');
    this.notifyIntegration();
  }

  private releaseInteraction(): void {
    if (this.interactionToken !== undefined) {
      this.arguments_.interactionCoordinator.release(this.interactionToken);
      this.interactionToken = undefined;
      this.notifyIntegration();
    }
  }

  private async runBeforeOpen(
    operation: 'create' | 'edit' | 'remove',
    row?: Readonly<TRow>,
    target?: Readonly<EditorOperationTarget>,
  ): Promise<boolean> {
    const hook = this.arguments_.options.hooks?.beforeOpen;
    if (hook === undefined) {
      return true;
    }

    const abortController = new AbortController();
    this.activeOpenAbortController = abortController;
    const context: BeforeOpenContext<TRow, TFormValues> = Object.freeze({
      mode: 'dialog',
      operation,
      signal: abortController.signal,
      ...(row === undefined ? {} : { row }),
      ...(target === undefined ? {} : { target }),
    });
    try {
      const shouldOpen = await Promise.resolve(hook(context));
      abortController.signal.throwIfAborted();
      return shouldOpen !== false;
    } catch (rawError: unknown) {
      const error = normalizeOperationError(
        rawError,
        abortController.signal,
        this.arguments_.language,
      );
      if (error instanceof InternalOperationAbort) {
        return false;
      }
      this.arguments_.errorReporter.report(
        error,
        {
          committed: false,
          mode: 'dialog',
          operation,
          phase: 'open',
          ...(target === undefined ? {} : { target }),
        },
        true,
      );
      throw error;
    } finally {
      if (this.activeOpenAbortController === abortController) {
        this.activeOpenAbortController = undefined;
      }
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
          this.arguments_.errorReporter.report(
            error,
            {
              committed: false,
              mode: 'dialog',
              operation: action,
              phase:
                this.arguments_.stateCoordinator.getState().status === 'opening'
                  ? 'open'
                  : 'validation',
              ...(action === 'edit' && this.editTarget !== undefined
                ? { target: this.createEditOperationTarget(this.editTarget) }
                : {}),
            },
            true,
          );
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
      this.arguments_.errorReporter.report(
        openingError,
        {
          committed: false,
          mode: 'dialog',
          operation: action,
          phase: 'open',
        },
        true,
      );
      throw rawError;
    }

    this.arguments_.stateCoordinator.transitionTo({ action, status: 'open' });
    this.dispatchOpen(action);
  }

  private dispatchOpen(operation: 'create' | 'edit' | 'remove'): void {
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
      this.arguments_.host.eventTarget,
      'alteditor-lite:open',
      {
        editor: this.arguments_.editor,
        mode: 'dialog',
        operation,
        ...(operation === 'edit' && this.editTarget !== undefined
          ? { target: this.createEditOperationTarget(this.editTarget) }
          : {}),
        type: 'open',
      },
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
          void this.createOperation.run(this.activeForm, this.createPresentation());
        }
        break;
      }
      case 'edit': {
        if (
          this.activeForm !== undefined &&
          this.editTarget !== undefined &&
          this.editOriginal !== undefined
        ) {
          const recordTarget = this.editTarget;
          void this.editOperation.run(
            this.activeForm,
            recordTarget,
            this.editOriginal,
            this.createEditOperationTarget(recordTarget),
            this.editPresentation(this.activeForm),
            (nextOriginal) => {
              this.editOriginal = createReadonlyRowView<TRow>(nextOriginal);
            },
          );
        }
        break;
      }
      case 'remove': {
        if (this.removeTargets !== undefined && this.removeOriginals !== undefined) {
          void this.removeOperation.run(
            this.removeTargets,
            this.removeOriginals,
            this.removePresentation(),
          );
        }
        break;
      }
    }
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

  private setSubmitting(action: 'create' | 'edit' | 'remove'): void {
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'submitting' });
    this.activeForm?.setBusy(true);
    this.dialog.setSubmitAvailable(true);
    this.dialog.setBusy(true);
    this.activeForm?.clearErrors();
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

  private closeAfterSuccess(action: 'create' | 'edit' | 'remove'): void {
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status !== 'submitting' || state.action !== action) {
      throw new EditorOperationBusyError();
    }
    this.arguments_.stateCoordinator.transitionTo({ action, status: 'closing' });
    this.finishClose(action, 'success');
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

  private finishClose(
    action: 'create' | 'edit' | 'remove',
    reason: EditorCloseReason,
  ): void {
    this.dialog.close();
    this.activeForm?.destroy();
    this.activeForm = undefined;
    const closeTarget =
      action === 'edit' && this.editTarget !== undefined
        ? this.createEditOperationTarget(this.editTarget)
        : undefined;
    this.editTarget = undefined;
    this.editOriginal = undefined;
    this.removeTargets = undefined;
    this.removeOriginals = undefined;
    this.releaseInteraction();
    this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
      this.arguments_.host.eventTarget,
      'alteditor-lite:close',
      {
        editor: this.arguments_.editor,
        mode: 'dialog',
        operation: action,
        reason,
        ...(closeTarget === undefined ? {} : { target: closeTarget }),
        type: 'close',
      },
    );
  }

  private createEditOperationTarget(target: TTarget): Readonly<EditorOperationTarget> {
    return Object.freeze({
      fieldNames: Object.freeze(
        this.arguments_.options.fields
          .filter((field) => field.editable !== false && field.disabled !== true)
          .map((field) => field.name),
      ),
      key: target,
    });
  }

  private notifyIntegration(): void {
    this.arguments_.notifyIntegration();
  }
}
