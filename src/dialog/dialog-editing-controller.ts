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
import { DialogOpenCoordinator } from './dialog-open-coordinator.js';
import {
  DialogRemoveOperation,
  type DialogRemovePresentation,
} from './dialog-remove-operation.js';
import { destroyDialogSession, type DialogSession } from './dialog-session.js';
import { EditorDialog } from './editor-dialog.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeCloseReason,
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
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { DialogAction, EditorOperationTarget } from '../core/editor-operation.js';
import type { EditorStateCoordinator } from '../core/editor-state-coordinator.js';
import type { EditorValues } from '../core/editor-values.js';
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

  private readonly openCoordinator: DialogOpenCoordinator<TRow, TFormValues, TTarget>;

  private activeSession: DialogSession<TRow, TFormValues, TTarget> | undefined;

  private interactionToken: InteractionToken | undefined;

  private provisionalForm:
    | EditorFormController<TFormValues>
    | BatchEditorFormController<TFormValues>
    | undefined;

  private closeDecisionAbortController: AbortController | undefined;

  private closeDecisionTask: Promise<void> | undefined;

  private closeDecisionSession: DialogSession<TRow, TFormValues, TTarget> | undefined;

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
    this.openCoordinator = new DialogOpenCoordinator({
      errorReporter: arguments_.errorReporter,
      host: arguments_.host,
      language: arguments_.language,
      options: arguments_.options,
    });
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
  public async openCreate(
    initialValues?: Readonly<EditorValues<TFormValues>>,
  ): Promise<void> {
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
      openAbortController = this.openCoordinator.begin();
      if (!(await this.openCoordinator.runBeforeOpen('create', openAbortController))) {
        this.releaseInteraction(interactionToken);
        return;
      }
      this.openCoordinator.assertCurrent(openAbortController);
      await this.openForm(
        'create',
        initialValues,
        (form) => ({ action: 'create', form }),
        {
          committed: false,
          mode: 'dialog',
          operation: 'create',
          phase: 'open',
        },
      );
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
      this.openCoordinator.complete(openAbortController);
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
      openAbortController = this.openCoordinator.begin();
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
      const originals = await this.openCoordinator.readSnapshots(
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
        !(await this.openCoordinator.runBeforeOpen(
          'edit',
          openAbortController,
          original,
          operationTarget,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = await this.openCoordinator.readSnapshots(
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
      this.openCoordinator.assertCurrent(openAbortController);
      await this.openForm(
        'edit',
        currentOriginal,
        (form) => ({
          action: 'edit',
          form,
          operationTarget,
          original: currentOriginal,
          recordTarget,
        }),
        {
          committed: false,
          mode: 'dialog',
          operation: 'edit',
          phase: 'open',
          target: operationTarget,
        },
        recordTarget,
      );
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
      this.openCoordinator.complete(openAbortController);
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
      openAbortController = this.openCoordinator.begin();
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
        await this.openCoordinator.readSnapshots(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'batchEdit',
          phase: 'open',
          targets: operationTargets,
        }),
      );
      if (
        !(await this.openCoordinator.runBeforeOpen(
          'batchEdit',
          openAbortController,
          originals,
          operationTargets,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = Object.freeze(
        await this.openCoordinator.readSnapshots(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'batchEdit',
          phase: 'open',
          targets: operationTargets,
        }),
      );
      this.openCoordinator.assertCurrent(openAbortController);
      const recordTargets = Object.freeze([...requestedTargets]);
      await this.openBatchForm(currentOriginals, recordTargets, operationTargets);
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
      this.openCoordinator.complete(openAbortController);
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
      openAbortController = this.openCoordinator.begin();
      const requestedTargets = this.resolveRequestedTargets(targets);
      if (requestedTargets.length === 0) {
        throw new EditorSelectionCountError(
          'one-or-more',
          0,
          this.arguments_.language.errors.selectionRequired,
        );
      }
      if (new Set(requestedTargets).size !== requestedTargets.length) {
        throw new EditorConfigurationError('Remove targets must be distinct.');
      }

      const operationTargets = requestedTargets.map((recordTarget) =>
        this.createEditOperationTarget(recordTarget),
      );
      const originals = Object.freeze(
        await this.openCoordinator.readSnapshots(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'remove',
          phase: 'open',
        }),
      );
      if (
        !(await this.openCoordinator.runBeforeOpen(
          'remove',
          openAbortController,
          originals,
          operationTargets,
        ))
      ) {
        this.releaseInteraction(interactionToken);
        return;
      }
      const currentOriginals = Object.freeze(
        await this.openCoordinator.readSnapshots(requestedTargets, openAbortController, {
          committed: false,
          mode: 'dialog',
          operation: 'remove',
          phase: 'open',
        }),
      );
      this.openCoordinator.assertCurrent(openAbortController);
      const recordTargets = Object.freeze([...requestedTargets]);
      let confirmationElement: HTMLDivElement;
      try {
        confirmationElement = createRemoveConfirmation(
          currentOriginals,
          this.arguments_.language,
          this.arguments_.options.editing?.dialog?.removeConfirmation,
        );
      } catch (rawError: unknown) {
        const error = normalizeOperationError(
          rawError,
          NEVER_ABORTED_SIGNAL,
          this.arguments_.language,
        );
        if (!(error instanceof InternalOperationAbort)) {
          this.arguments_.errorReporter.report(
            error,
            {
              committed: false,
              mode: 'dialog',
              operation: 'remove',
              phase: 'open',
            },
            true,
          );
        }
        throw rawError;
      }
      this.arguments_.stateCoordinator.transitionTo({
        action: 'remove',
        status: 'opening',
      });
      try {
        this.dialog.openConfirmation(
          confirmationElement,
          this.arguments_.language.dialog.removeTitle,
          this.arguments_.language.actions.remove,
          {
            onRequestClose: (reason) => {
              this.observeCloseRequest(reason);
            },
            onSubmit: () => {
              this.beginSubmission();
            },
          },
        );
      } catch (error: unknown) {
        confirmationElement.remove();
        this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
        throw error;
      }

      this.activeSession = {
        action: 'remove',
        operationTargets,
        originals: currentOriginals,
        recordTargets,
      };

      this.arguments_.stateCoordinator.transitionTo({
        action: 'remove',
        status: 'open',
      });
      this.dispatchOpen(this.requireSession('remove'));
    } catch (error: unknown) {
      const session = this.activeSession;
      if (this.interactionToken === interactionToken && session?.action === 'remove') {
        this.activeSession = undefined;
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
      this.openCoordinator.complete(openAbortController);
    }
  }

  /** Closes the active dialog or cancels an opening request. */
  public close(): Promise<void> {
    try {
      this.arguments_.stateCoordinator.assertActive();
      return this.requestClose('api');
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Returns a field facade while an editing form is active. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.arguments_.stateCoordinator.assertActive();
    const session = this.activeSession;
    if (session === undefined) {
      return null;
    }
    switch (session.action) {
      case 'create':
      case 'edit':
      case 'batchEdit': {
        return session.form.getField(name);
      }
      case 'remove': {
        return null;
      }
    }
  }

  /** Aborts opening and submission work and removes all dialog-owned DOM. */
  public destroy(): void {
    const session = this.activeSession;
    const provisionalForm = this.provisionalForm;
    this.activeSession = undefined;
    this.provisionalForm = undefined;
    runCleanupSteps([
      () => {
        this.openCoordinator.destroy();
      },
      () => {
        this.invalidateCloseDecision();
      },
      () => {
        this.arguments_.operationOwner.abort('dialog');
      },
      () => {
        provisionalForm?.destroy();
      },
      () => {
        if (session !== undefined) {
          destroyDialogSession(session);
        }
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
    sourceValues: Readonly<object> | undefined,
    createSession: (
      form: EditorFormController<TFormValues>,
    ) => Extract<
      DialogSession<TRow, TFormValues, TTarget>,
      { readonly action: 'create' | 'edit' }
    >,
    errorContext: EditorErrorHookContext,
    uniquenessTarget?: TTarget,
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
            uniquenessTarget === undefined ? undefined : { target: uniquenessTarget },
          ),
        this.resolveDialogTemplate(action),
        this.arguments_.options.dependencies,
        (_sourcePath, error) => {
          this.arguments_.errorReporter.report(
            error,
            {
              ...errorContext,
              phase:
                this.arguments_.stateCoordinator.getState().status === 'opening'
                  ? 'open'
                  : 'validation',
            },
            true,
          );
        },
      );
      this.provisionalForm = form;
      if (sourceValues !== undefined) {
        form.populateFromSource(sourceValues);
      }
      await form.initializeDependencies();
      await form.rebaseDirtyState();
      this.arguments_.stateCoordinator.assertActive();
      this.dialog.openForm(
        form.element,
        action === 'create'
          ? this.arguments_.language.dialog.createTitle
          : this.arguments_.language.dialog.editTitle,
        this.arguments_.language.actions.submit,
        {
          onRequestClose: (reason) => {
            this.observeCloseRequest(reason);
          },
          onSubmit: () => {
            this.beginSubmission();
          },
        },
      );
      const session = createSession(form);
      if (session.action !== action || this.activeSession !== undefined) {
        throw new Error('Dialog resources do not match the opening action.');
      }
      this.provisionalForm = undefined;
      this.activeSession = session;
    } catch (rawError: unknown) {
      try {
        runCleanupSteps([
          () => {
            this.dialog.close();
          },
          () => {
            form?.destroy();
          },
        ]);
      } catch {
        // Continue handling the opening failure.
      }
      if (this.provisionalForm === form) {
        this.provisionalForm = undefined;
      }
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
      this.arguments_.errorReporter.report(openingError, errorContext, true);
      throw rawError;
    }

    this.arguments_.stateCoordinator.transitionTo({ action, status: 'open' });
    this.dispatchOpen(this.requireSession(action));
  }

  private async openBatchForm(
    originals: readonly Readonly<TRow>[],
    recordTargets: readonly TTarget[],
    operationTargets: readonly Readonly<EditorOperationTarget>[],
  ): Promise<void> {
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
        this.resolveDialogTemplate('batchEdit'),
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
              targets: operationTargets,
            },
            true,
          );
        },
      );
      this.provisionalForm = form;
      await form.initializeDependencies();
      this.arguments_.stateCoordinator.assertActive();
      this.dialog.openForm(
        form.element,
        this.arguments_.language.dialog.batchEditTitle,
        this.arguments_.language.actions.submit,
        {
          onRequestClose: (reason) => {
            this.observeCloseRequest(reason);
          },
          onSubmit: () => {
            this.beginSubmission();
          },
        },
      );
      if (this.activeSession !== undefined) {
        throw new Error('Dialog resources are already active.');
      }
      this.provisionalForm = undefined;
      this.activeSession = {
        action: 'batchEdit',
        form,
        operationTargets,
        originals,
        recordTargets,
      };
    } catch (rawError: unknown) {
      try {
        runCleanupSteps([
          () => {
            this.dialog.close();
          },
          () => {
            form?.destroy();
          },
        ]);
      } catch {
        // Continue handling the opening failure.
      }
      if (this.provisionalForm === form) {
        this.provisionalForm = undefined;
      }
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
          targets: operationTargets,
        },
        true,
      );
      throw rawError;
    }

    this.arguments_.stateCoordinator.transitionTo({
      action: 'batchEdit',
      status: 'open',
    });
    this.dispatchOpen(this.requireSession('batchEdit'));
  }

  private dispatchOpen(session: DialogSession<TRow, TFormValues, TTarget>): void {
    switch (session.action) {
      case 'create':
      case 'remove': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:open',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: session.action,
            type: 'open',
          },
        );
        return;
      }
      case 'edit': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:open',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: 'edit',
            target: session.operationTarget,
            type: 'open',
          },
        );
        return;
      }
      case 'batchEdit': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:open',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: 'batchEdit',
            originals: session.originals,
            targets: session.operationTargets,
            type: 'open',
          },
        );
      }
    }
  }

  private resolveDialogTemplate(
    operation: 'create' | 'edit' | 'batchEdit',
  ): DialogTemplateSource | undefined {
    const template = this.arguments_.editing.template;
    return typeof template === 'function'
      ? template(Object.freeze({ operation }))
      : template;
  }

  private beginSubmission(): void {
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status !== 'open') {
      return;
    }
    const session = this.activeSession;
    if (session?.action !== state.action) {
      throw new Error('Dialog state does not match its active resources.');
    }
    switch (session.action) {
      case 'create': {
        this.observeSubmission(
          this.createOperation.run(session.form, this.createPresentation()),
        );
        break;
      }
      case 'edit': {
        const { form } = session;
        this.observeSubmission(
          this.editOperation.run(
            form,
            session.recordTarget,
            session.original,
            session.operationTarget,
            this.editPresentation(form),
            (nextTarget) => {
              session.recordTarget = nextTarget;
              session.operationTarget = this.createEditOperationTarget(nextTarget);
            },
            async (nextOriginal) => {
              const snapshot = createReadonlyRowView<TRow>(nextOriginal);
              session.original = snapshot;
              form.populateFromSource(snapshot);
              await form.initializeDependencies();
            },
          ),
        );
        break;
      }
      case 'remove': {
        this.observeSubmission(
          this.removeOperation.run(
            session.recordTargets,
            session.originals,
            this.removePresentation(),
          ),
        );
        break;
      }
      case 'batchEdit': {
        const { form } = session;
        this.observeSubmission(
          this.batchEditOperation.run(
            form,
            session.recordTargets,
            session.originals,
            session.operationTargets,
            this.batchEditPresentation(form),
            (nextOriginals) => {
              session.originals = Object.freeze(
                nextOriginals.map((row) => createReadonlyRowView<TRow>(row)),
              );
            },
          ),
        );
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
      completeSuccess: async (form, row) => {
        if (this.arguments_.editing.closeOnSuccess) {
          this.closeAfterSuccess('create');
          return;
        }
        try {
          form.populateFromSource(row);
          await form.initializeDependencies();
        } finally {
          try {
            await form.rebaseDirtyState();
          } finally {
            this.restoreOpen('create', form);
          }
        }
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
      completeSuccess: async () => {
        await this.completeFormSuccess('edit', form);
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
          form.rebase(this.requireSession('batchEdit').originals);
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
    const form = this.getActiveSessionForm();
    form?.setBusy(true);
    this.dialog.setSubmitAvailable(true);
    this.dialog.setBusy(true);
    form?.clearErrors();
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

  private async completeFormSuccess(
    action: 'create' | 'edit',
    form: EditorFormController<TFormValues>,
  ): Promise<void> {
    if (this.arguments_.editing.closeOnSuccess) {
      this.closeAfterSuccess(action);
    } else {
      try {
        await form.rebaseDirtyState();
      } finally {
        this.restoreOpen(action, form);
      }
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

  private observeCloseRequest(reason: BeforeCloseReason): void {
    void this.requestClose(reason).catch(() => undefined);
  }

  private requestClose(reason: BeforeCloseReason): Promise<void> {
    const pendingTask = this.closeDecisionTask;
    if (pendingTask !== undefined) {
      return pendingTask;
    }

    const state = this.arguments_.stateCoordinator.getState();
    if (state.status === 'ready') {
      this.closeNow(reason);
      return Promise.resolve();
    }
    if (state.status !== 'open' && state.status !== 'submitting') {
      return Promise.reject(new EditorOperationBusyError());
    }
    const session = this.activeSession;
    if (session?.action !== state.action) {
      return Promise.reject(
        new Error('Dialog state does not match its active resources.'),
      );
    }

    const abortController = new AbortController();
    this.closeDecisionAbortController = abortController;
    this.closeDecisionSession = session;
    const task = Promise.resolve().then(async () => {
      await this.evaluateCloseRequest(session, reason, abortController);
    });
    this.closeDecisionTask = task;
    return task;
  }

  private async evaluateCloseRequest(
    session: DialogSession<TRow, TFormValues, TTarget>,
    reason: BeforeCloseReason,
    abortController: AbortController,
  ): Promise<void> {
    try {
      const beforeClose = this.arguments_.options.hooks?.beforeClose;
      if (beforeClose !== undefined) {
        const isDirty = await this.isSessionDirty(session);
        if (!this.ownsCloseDecision(session, abortController)) {
          return;
        }
        const shouldClose = await Promise.resolve(
          beforeClose(
            Object.freeze({
              dirty: isDirty,
              mode: 'dialog',
              operation: session.action,
              reason,
              signal: abortController.signal,
            }),
          ),
        );
        if (!this.ownsCloseDecision(session, abortController)) {
          return;
        }
        if (shouldClose === false) {
          this.dialog.ensureFocus();
          return;
        }
      }
      if (this.ownsCloseDecision(session, abortController)) {
        this.closeNow(reason);
      }
    } catch (rawError: unknown) {
      if (!this.ownsCloseDecision(session, abortController)) {
        return;
      }
      const error = normalizeOperationError(
        rawError,
        abortController.signal,
        this.arguments_.language,
      );
      if (error instanceof InternalOperationAbort) {
        return;
      }
      this.dialog.showError(error.message);
      this.dialog.ensureFocus();
      this.arguments_.errorReporter.report(
        error,
        this.createCloseErrorContext(session),
        true,
      );
      throw error;
    } finally {
      if (this.closeDecisionAbortController === abortController) {
        this.closeDecisionAbortController = undefined;
        this.closeDecisionSession = undefined;
        this.closeDecisionTask = undefined;
      }
    }
  }

  private async isSessionDirty(
    session: DialogSession<TRow, TFormValues, TTarget>,
  ): Promise<boolean> {
    switch (session.action) {
      case 'create':
      case 'edit':
      case 'batchEdit': {
        return await session.form.isDirty();
      }
      case 'remove': {
        return false;
      }
    }
  }

  private ownsCloseDecision(
    session: DialogSession<TRow, TFormValues, TTarget>,
    abortController: AbortController,
  ): boolean {
    return (
      !abortController.signal.aborted &&
      this.activeSession === session &&
      this.closeDecisionSession === session &&
      this.closeDecisionAbortController === abortController
    );
  }

  private createCloseErrorContext(
    session: DialogSession<TRow, TFormValues, TTarget>,
  ): EditorErrorHookContext {
    const closeContextBase = {
      committed: false,
      mode: 'dialog',
      phase: 'close',
    } as const;
    switch (session.action) {
      case 'create':
      case 'remove': {
        return { ...closeContextBase, operation: session.action };
      }
      case 'edit': {
        return {
          ...closeContextBase,
          operation: 'edit',
          target: session.operationTarget,
        };
      }
      case 'batchEdit': {
        return {
          ...closeContextBase,
          operation: 'batchEdit',
          targets: session.operationTargets,
        };
      }
    }
  }

  private invalidateCloseDecision(): void {
    this.closeDecisionAbortController?.abort();
    this.closeDecisionAbortController = undefined;
    this.closeDecisionSession = undefined;
    this.closeDecisionTask = undefined;
  }

  private closeNow(reason: Exclude<EditorCloseReason, 'success'>): void {
    this.arguments_.stateCoordinator.assertActive();
    const state = this.arguments_.stateCoordinator.getState();
    if (state.status === 'ready') {
      if (this.interactionToken !== undefined) {
        this.openCoordinator.cancel();
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
    const session = this.requireSession(action);
    this.invalidateCloseDecision();
    this.activeSession = undefined;
    runCleanupSteps([
      () => {
        this.dialog.close();
      },
      () => {
        destroyDialogSession(session);
      },
      () => {
        this.releaseInteraction();
      },
      () => {
        this.arguments_.stateCoordinator.transitionTo({ status: 'ready' });
      },
      () => {
        this.dispatchClose(session, reason);
      },
    ]);
  }

  private dispatchClose(
    session: DialogSession<TRow, TFormValues, TTarget>,
    reason: EditorCloseReason,
  ): void {
    switch (session.action) {
      case 'create':
      case 'remove': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:close',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: session.action,
            reason,
            type: 'close',
          },
        );
        return;
      }
      case 'edit': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:close',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: 'edit',
            reason,
            target: session.operationTarget,
            type: 'close',
          },
        );
        return;
      }
      case 'batchEdit': {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
          this.arguments_.host.eventTarget,
          'alteditor-lite:close',
          {
            editor: this.arguments_.editor,
            mode: 'dialog',
            operation: 'batchEdit',
            reason,
            targets: session.operationTargets,
            type: 'close',
          },
        );
      }
    }
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

  private getActiveSessionForm():
    | EditorFormController<TFormValues>
    | BatchEditorFormController<TFormValues>
    | undefined {
    const session = this.activeSession;
    if (session === undefined || session.action === 'remove') {
      return undefined;
    }
    return session.form;
  }

  private requireSession<TAction extends DialogAction>(
    action: TAction,
  ): Extract<DialogSession<TRow, TFormValues, TTarget>, { readonly action: TAction }> {
    const session = this.activeSession;
    if (session?.action !== action) {
      throw new Error('Dialog state does not match its active resources.');
    }
    return session as Extract<
      DialogSession<TRow, TFormValues, TTarget>,
      { readonly action: TAction }
    >;
  }

  private notifyIntegration(): void {
    this.arguments_.notifyIntegration();
  }
}
