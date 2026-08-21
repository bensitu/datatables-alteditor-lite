import {
  type AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorOperationBusyError,
} from '../core/alt-editor-lite-error.js';
import { dispatchEditorEvent, type EditorCloseReason } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';

import { InlineCommitCoordinator } from './inline-commit-coordinator.js';
import { InlineEditPresentationAdapter } from './inline-edit-presentation-adapter.js';
import { assertInlineEditStateTransition } from './inline-edit-state-transition.js';
import { InlineFocusCoordinator } from './inline-focus-coordinator.js';
import { ownsInlineFocus } from './inline-focus-owner.js';
import { resolveInlineKeyboardIntent } from './inline-keyboard.js';
import {
  createInlineEventTarget,
  createInlineOperationTarget,
} from './inline-operation-target.js';
import { InlineSessionFactory } from './inline-session-factory.js';
import { InlineValidationController } from './inline-validation-controller.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineEditSession } from './inline-edit-session.js';
import type { InlineEditState } from './inline-edit-state.js';
import type { InlineEditViewFactory } from './inline-edit-view-factory.js';
import type { ResolvedInlineInteractionBehavior } from './inline-interaction-behavior.js';
import type { InlineNavigationIntent } from './inline-navigation.js';
import type { InlineTargetCapture } from './inline-target-capture.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeOpenContext,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type {
  EditOperationResult,
  EditOperationRunner,
} from '../core/editing/edit-operation-runner.js';
import type {
  InteractionCoordinator,
  InteractionToken,
} from '../core/editing/interaction-coordinator.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { EditorValues } from '../core/editor-values.js';
import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';
import type { LogicalCellTarget } from '../datatables/commit-row-update.js';
import type { DataTablesHost } from '../datatables/data-tables-host.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

export interface InlineEditSessionControllerArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly enabled: boolean;
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly table: Api<TRow>;
  readonly tableElement: HTMLTableElement;
  readonly fields: readonly FieldConfig<TFormValues>[];
  readonly mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>;
  readonly options: Readonly<ResolvedInlineEditingOptions<TFormValues>>;
  readonly editorOptions: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly instanceId: string;
  readonly interactionCoordinator: InteractionCoordinator;
  readonly operationOwner: OperationOwner;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly host: DataTablesHost<TRow>;
  readonly validateUnique: (
    values: Readonly<EditorValues<TFormValues>>,
    excludedRow: TRow,
  ) => Readonly<Record<string, string>>;
  readonly reportError: (
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ) => void;
  readonly notifyIntegration: () => void;
  readonly interactionBehavior: Readonly<ResolvedInlineInteractionBehavior>;
  readonly viewFactory: InlineEditViewFactory<TFormValues>;
  readonly onSessionStart?: () => void;
  readonly onSessionEnd?: () => void;
}

/** Owns one inline editing session at a time. */
export class InlineEditSessionController<
  TRow extends object,
  TFormValues extends object,
> {
  private readonly fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>;

  private readonly sessionFactory: InlineSessionFactory<TFormValues>;

  private readonly validationController: InlineValidationController<TRow, TFormValues>;

  private readonly commitCoordinator: InlineCommitCoordinator<TRow, TFormValues>;

  private readonly focusCoordinator: InlineFocusCoordinator<TRow, TFormValues>;

  private state: InlineEditState;

  private session: InlineEditSession<TRow, TFormValues> | undefined;

  private activationAbortController: AbortController | undefined;

  private activationInteractionToken: InteractionToken | undefined;

  private changeAbortController: AbortController | undefined;

  private nextSessionId = 0;

  private isDestroyed = false;

  public constructor(
    private readonly arguments_: InlineEditSessionControllerArguments<TRow, TFormValues>,
  ) {
    this.fieldsByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
      arguments_.fields.map((field) => [field.name, field]),
    );
    this.focusCoordinator = new InlineFocusCoordinator({
      enabled: arguments_.enabled,
      host: arguments_.host,
      instanceId: arguments_.instanceId,
      language: arguments_.language,
      mappings: arguments_.mappings,
      options: arguments_.options,
    });
    this.sessionFactory = new InlineSessionFactory({
      instanceId: arguments_.instanceId,
      language: arguments_.language,
      onCancel: (reason) => {
        void this.cancel(reason);
      },
      onSubmit: () => {
        void this.submit().catch(() => undefined);
      },
      onUserChange: this.handleUserChange,
      options: arguments_.options,
      tableElement: arguments_.tableElement,
      viewFactory: arguments_.viewFactory,
    });
    this.validationController = new InlineValidationController({
      fields: arguments_.fields,
      isCurrentSession: (session) => this.session === session,
      language: arguments_.language,
      presentFailure: async (session, error, message) => {
        if (message !== undefined) {
          session.controller.showError(message);
        }
        session.host.setInvalid(true);
        this.transitionTo({
          error,
          status: 'error',
          target: session.capture.summary,
        });
        await this.focusCoordinator.showAlert(
          session,
          error,
          'validation',
          () => this.session === session,
          () => this.isDestroyed,
        );
      },
      reportError: arguments_.reportError,
      table: arguments_.table,
      ...(arguments_.editorOptions.validateForm === undefined
        ? {}
        : { validateForm: arguments_.editorOptions.validateForm }),
      validateUnique: arguments_.validateUnique,
    });
    this.commitCoordinator = new InlineCommitCoordinator({
      host: arguments_.host,
      editOperationRunner: arguments_.editOperationRunner,
      editor: arguments_.editor,
      editorOptions: arguments_.editorOptions,
      mappings: arguments_.mappings,
      operationOwner: arguments_.operationOwner,
      options: arguments_.options,
      reportError: arguments_.reportError,
      table: arguments_.table,
      tableElement: arguments_.tableElement,
      targetUnavailableMessage: arguments_.language.inline.targetUnavailable,
    });
    this.state = arguments_.enabled
      ? Object.freeze({ status: 'idle' })
      : Object.freeze({ status: 'disabled' });

    if (arguments_.enabled) {
      arguments_.table.on('draw.altEditorLiteInline', this.handleExternalDraw);
      arguments_.table.on(
        'column-visibility.altEditorLiteInline column-reorder.altEditorLiteInline responsive-resize.altEditorLiteInline',
        this.handleExternalDraw,
      );
    }
  }

  /** Opens one uniquely resolved eligible cell. */
  public async open(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void> {
    this.assertActive();
    if (!this.arguments_.enabled) {
      throw new EditorConfigurationError('Inline Edit is unavailable in dialog mode.');
    }
    if (this.state.status !== 'idle') {
      throw new EditorOperationBusyError();
    }

    const originalActiveElement = document.activeElement;
    const capture = this.arguments_.host.captureInlineTarget(
      rowSelector,
      columnSelector,
      this.fieldsByName,
      this.arguments_.mappings,
      this.arguments_.language.inline.unavailable,
    );
    const interactionToken = this.arguments_.interactionCoordinator.acquire('inline');
    this.activationInteractionToken = interactionToken;
    const activationAbortController = new AbortController();
    this.activationAbortController = activationAbortController;
    this.transitionTo({ status: 'activating', target: capture.summary });
    let createdSession: InlineEditSession<TRow, TFormValues> | undefined;

    try {
      const shouldOpen = await this.runBeforeOpen(capture, activationAbortController);
      if (activationAbortController.signal.aborted || this.isDestroyed) {
        this.releaseActivationInteraction();
        if ((this.state as InlineEditState).status === 'activating') {
          this.transitionTo({ status: 'idle' });
        }
        return;
      }
      if (!shouldOpen) {
        this.releaseActivationInteraction();
        this.transitionTo({ status: 'idle' });
        return;
      }

      this.arguments_.host.resolveInlineTarget(
        capture,
        this.arguments_.mappings,
        this.arguments_.language.inline.targetUnavailable,
      );

      createdSession = await this.sessionFactory.create({
        capture,
        interactionToken,
        originalActiveElement,
        sessionId: (this.nextSessionId += 1),
        signal: activationAbortController.signal,
      });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Cancellation can occur while an asynchronous controller resolves.
      if (activationAbortController.signal.aborted || this.isDestroyed) {
        createdSession.host.destroy();
        createdSession.controller.destroy();
        createdSession = undefined;
        this.releaseActivationInteraction();
        if ((this.state as InlineEditState).status === 'activating') {
          this.transitionTo({ status: 'idle' });
        }
        return;
      }
      this.arguments_.host.resolveInlineTarget(
        capture,
        this.arguments_.mappings,
        this.arguments_.language.inline.targetUnavailable,
      );

      const session = createdSession;
      this.session = session;
      createdSession = undefined;
      this.activationInteractionToken = undefined;
      session.host.mount(capture.cellNode);
      this.arguments_.onSessionStart?.();
      session.host.element.addEventListener('keydown', this.handleEscapeKeyDown, true);
      session.host.element.addEventListener('keydown', this.handleKeyDown);
      session.host.element.addEventListener('focusout', this.handleFocusOut);
      session.host.element.addEventListener('click', this.stopOwnedPointerEvent);
      session.host.element.addEventListener('dblclick', this.stopOwnedPointerEvent);
      session.host.element.addEventListener('pointerdown', this.stopOwnedPointerEvent);
      this.transitionTo({ dirty: false, status: 'editing', target: capture.summary });
      this.focusCoordinator.sessionMounted();
      session.host.focus();
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
        this.arguments_.tableElement,
        'alteditor-lite:open',
        {
          editor: this.arguments_.editor,
          mode: 'inline',
          operation: 'edit',
          target: createInlineEventTarget(capture.summary),
          type: 'open',
        },
      );
      this.arguments_.notifyIntegration();
    } catch (rawError: unknown) {
      if (this.session?.capture === capture) {
        this.cleanupSession('api', true, false, false);
      } else {
        try {
          runCleanupSteps([
            () => {
              createdSession?.host.destroy();
            },
            () => {
              createdSession?.controller.destroy();
            },
            () => {
              this.releaseActivationInteraction();
            },
          ]);
        } catch {
          // Preserve the activation failure.
        }
      }
      if ((this.state as InlineEditState).status === 'activating') {
        this.transitionTo({ status: 'idle' });
      }
      const error = normalizeOperationError(
        rawError,
        activationAbortController.signal,
        this.arguments_.language,
      );
      if (!(error instanceof InternalOperationAbort)) {
        this.arguments_.reportError(
          error,
          {
            committed: false,
            mode: 'inline',
            operation: 'edit',
            phase: 'open',
            target: createInlineOperationTarget(capture.summary),
          },
          true,
        );
        throw error;
      }
    } finally {
      if (this.activationAbortController === activationAbortController) {
        this.activationAbortController = undefined;
      }
    }
  }

  /** Validates and submits the active candidate. */
  public async submit(): Promise<void> {
    this.assertActive();
    const session = this.session;
    if (
      session === undefined ||
      (this.state.status !== 'editing' && this.state.status !== 'error')
    ) {
      throw new EditorOperationBusyError();
    }

    const navigationIntent = session.navigationIntent;
    let focusTarget: Readonly<LogicalCellTarget<TRow>> | undefined;
    const presentation = this.createPresentation(
      session,
      navigationIntent,
      () => focusTarget,
    );
    presentation.startValidation();

    let candidate: unknown;
    try {
      candidate = await Promise.resolve(
        session.controller.getValue(session.lifecycleAbortController.signal),
      );
    } catch (error: unknown) {
      if (session.lifecycleAbortController.signal.aborted || this.session !== session) {
        return;
      }
      presentation.restoreAfterValidationFailure();
      throw error;
    }
    if (session.lifecycleAbortController.signal.aborted || this.session !== session) {
      return;
    }
    if (Object.is(candidate, session.normalizedOriginalValue)) {
      this.cleanupSession('unchanged', true, true);
      return;
    }
    session.candidate = candidate;
    const result = await this.commitCoordinator.run(session, presentation, (target) => {
      focusTarget = target;
    });
    this.throwRejectedResult(result);
  }

  /** Cancels activation, validation, persistence, or an open inline session. */
  public cancel(reason: EditorCloseReason = 'api'): Promise<void> {
    this.assertActive();
    this.activationAbortController?.abort();
    this.releaseActivationInteraction();
    this.changeAbortController?.abort();
    this.arguments_.operationOwner.abort('inline');

    if (this.session !== undefined) {
      this.cleanupSession(reason, true, true);
    } else if (this.state.status === 'activating') {
      this.transitionTo({ status: 'idle' });
    }
    return Promise.resolve();
  }

  /** Returns the current immutable inline state. */
  public getState(): Readonly<InlineEditState> {
    this.assertActive();
    return this.state;
  }

  /** Returns whether activation or an open session currently owns inline state. */
  public isEditing(): boolean {
    return (
      this.state.status !== 'disabled' &&
      this.state.status !== 'idle' &&
      this.state.status !== 'destroyed'
    );
  }

  /** Removes all listeners and owned DOM resources. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    const session = this.session;
    runCleanupSteps([
      () => {
        this.activationAbortController?.abort();
      },
      () => {
        this.releaseActivationInteraction();
      },
      () => {
        this.changeAbortController?.abort();
      },
      () => {
        this.arguments_.operationOwner.abort('inline');
      },
      () => {
        this.arguments_.table.off('.altEditorLiteInline');
      },
      () => {
        if (session !== undefined && this.session === session) {
          this.cleanupSession('api', true, ownsInlineFocus(session.host.element));
        }
      },
      () => {
        this.transitionTo({ status: 'destroyed' });
      },
      () => {
        this.focusCoordinator.destroy();
      },
    ]);
  }

  private createPresentation(
    session: InlineEditSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
    getFocusTarget: () => Readonly<LogicalCellTarget<TRow>> | undefined,
  ) {
    return new InlineEditPresentationAdapter<TRow, TFormValues>({
      completeSuccess: async () => {
        this.cleanupSession('success', false, false);
        this.arguments_.host.synchronizeExtensions();
        await this.focusCoordinator.restoreAfterCommit(
          session,
          navigationIntent,
          getFocusTarget(),
          async (rowIndex, columnIndex) => {
            await this.open(rowIndex, columnIndex);
          },
        );
      },
      restoreAfterOperationFailure: () => {
        this.focusCoordinator.operationReturnedToEditing();
      },
      restoreAfterValidationFailure: () => {
        session.host.setBusy(false);
        if (this.state.status === 'validating') {
          this.transitionTo({
            dirty: true,
            status: 'editing',
            target: session.capture.summary,
          });
        }
        this.focusCoordinator.operationReturnedToEditing();
        session.host.focus();
      },
      setBusy: (isBusy: boolean) => {
        session.host.setBusy(isBusy);
        if (isBusy && this.state.status === 'validating') {
          this.transitionTo({
            status: 'submitting',
            target: session.capture.summary,
          });
          this.focusCoordinator.submissionStarted();
        }
      },
      showOperationError: async (error: AltEditorLiteError) => {
        const fieldMessage = error.fieldErrors?.[session.capture.field.name];
        if (fieldMessage !== undefined) {
          session.controller.showError(fieldMessage);
        }
        session.host.setInvalid(true);
        this.transitionTo({
          error,
          status: 'error',
          target: session.capture.summary,
        });
        await this.focusCoordinator.showAlert(
          session,
          error,
          'operation',
          () => this.session === session,
          () => this.isDestroyed,
        );
      },
      startValidation: () => {
        if (this.state.status === 'validating') {
          return;
        }
        session.host.setActionBusy?.(true);
        session.controller.clearError();
        session.host.setInvalid(false);
        this.transitionTo({
          status: 'validating',
          target: session.capture.summary,
        });
        this.focusCoordinator.validationStarted();
      },
      validate: async (signal: AbortSignal) =>
        await this.validationController.validate(session, signal),
    });
  }

  private async runBeforeOpen(
    capture: InlineTargetCapture<TRow, TFormValues>,
    abortController: AbortController,
  ): Promise<boolean> {
    const hook = this.arguments_.editorOptions.hooks?.beforeOpen;
    if (hook === undefined) {
      return true;
    }
    const context: BeforeOpenContext<TRow, TFormValues> = Object.freeze({
      mode: 'inline',
      operation: 'edit',
      row: capture.rowCapture.snapshot.original,
      signal: abortController.signal,
      target: createInlineOperationTarget(capture.summary),
    });
    return (await Promise.resolve(hook(context))) !== false;
  }

  private readonly handleExternalDraw = (): void => {
    if (this.arguments_.host.ownsPresentationChange() || !this.isEditing()) {
      return;
    }
    this.activationAbortController?.abort();
    this.releaseActivationInteraction();
    this.changeAbortController?.abort();
    this.arguments_.operationOwner.abort('inline');
    if (this.session !== undefined) {
      this.cleanupSession('redraw', false, ownsInlineFocus(this.session.host.element));
    } else if (this.state.status === 'activating') {
      this.transitionTo({ status: 'idle' });
    }
  };

  private readonly handleFocusOut = (): void => {
    queueMicrotask(() => {
      const session = this.session;
      if (
        session === undefined ||
        !this.focusCoordinator.shouldApplyBlurAction() ||
        ownsInlineFocus(session.host.element) ||
        this.state.status !== 'editing'
      ) {
        return;
      }
      if (this.arguments_.interactionBehavior.blurAction === 'submit') {
        void this.submit().catch(() => undefined);
      } else if (this.arguments_.interactionBehavior.blurAction === 'cancel') {
        void this.cancel('cancel');
      }
    });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const session = this.session;
    if (session === undefined) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest('[data-alteditor-lite-inline-action]') !== null
    ) {
      return;
    }
    const intent = resolveInlineKeyboardIntent(
      event,
      session.capture.field,
      this.arguments_.interactionBehavior,
    );
    if (intent === undefined) {
      return;
    }
    if (intent.type === 'cancel') {
      event.preventDefault();
      event.stopPropagation();
      void this.cancel('escape');
      return;
    }
    if (this.state.status !== 'editing' && this.state.status !== 'error') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (intent.type === 'submit-and-move') {
      const navigationIntent = this.arguments_.host.createInlineNavigationIntent(
        this.arguments_.mappings,
        this.fieldsByName,
        session.capture.summary,
        intent.direction,
      );
      if (navigationIntent === undefined) {
        delete session.navigationIntent;
      } else {
        session.navigationIntent = navigationIntent;
      }
    }
    void this.submit().catch(() => undefined);
  };

  private readonly handleEscapeKeyDown = (event: KeyboardEvent): void => {
    const session = this.session;
    if (session === undefined || event.key !== 'Escape') {
      return;
    }
    const intent = resolveInlineKeyboardIntent(
      event,
      session.capture.field,
      this.arguments_.interactionBehavior,
    );
    if (intent?.type !== 'cancel') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    void this.cancel('escape');
  };

  private readonly handleUserChange = (): void => {
    const session = this.session;
    if (session === undefined) {
      return;
    }
    if (this.state.status === 'submitting') {
      return;
    }
    if (this.state.status === 'validating') {
      this.arguments_.operationOwner.abort('inline');
      this.focusCoordinator.operationReturnedToEditing();
      this.transitionTo({
        dirty: true,
        status: 'editing',
        target: session.capture.summary,
      });
    } else if (this.state.status === 'error') {
      session.host.setInvalid(false);
      this.transitionTo({
        dirty: true,
        status: 'editing',
        target: session.capture.summary,
      });
    } else if (this.state.status === 'editing') {
      this.replaceEditingState({
        dirty: true,
        status: 'editing',
        target: session.capture.summary,
      });
    } else {
      return;
    }
    session.changeRevision += 1;
    const revision = session.changeRevision;
    delete session.pendingChangeError;
    this.changeAbortController?.abort();
    const abortController = new AbortController();
    this.changeAbortController = abortController;
    const pendingChange = this.validationController
      .runOnChange(session, abortController.signal, revision)
      .finally(() => {
        if (session.pendingChange === pendingChange) {
          delete session.pendingChange;
        }
      });
    session.pendingChange = pendingChange;
  };

  private cleanupSession(
    reason: EditorCloseReason,
    restoreOriginalContent: boolean,
    restoreFocus: boolean,
    publishClose = true,
  ): void {
    const session = this.session;
    if (session === undefined) {
      return;
    }
    this.session = undefined;
    const changeAbortController = this.changeAbortController;
    this.changeAbortController = undefined;
    let canRestoreOriginalContent = false;
    if (restoreOriginalContent) {
      try {
        this.arguments_.host.resolveInlineTarget(
          session.capture,
          this.arguments_.mappings,
          this.arguments_.language.inline.targetUnavailable,
        );
        canRestoreOriginalContent = true;
      } catch {
        canRestoreOriginalContent = false;
      }
    }
    runCleanupSteps([
      () => {
        this.focusCoordinator.beginCleanup();
      },
      () => {
        session.lifecycleAbortController.abort();
      },
      () => {
        changeAbortController?.abort();
      },
      () => {
        session.host.element.removeEventListener(
          'keydown',
          this.handleEscapeKeyDown,
          true,
        );
        session.host.element.removeEventListener('keydown', this.handleKeyDown);
        session.host.element.removeEventListener('focusout', this.handleFocusOut);
        session.host.element.removeEventListener('click', this.stopOwnedPointerEvent);
        session.host.element.removeEventListener('dblclick', this.stopOwnedPointerEvent);
        session.host.element.removeEventListener(
          'pointerdown',
          this.stopOwnedPointerEvent,
        );
      },
      () => {
        session.host.unmount({ restoreOriginalContent: canRestoreOriginalContent });
      },
      () => {
        session.host.destroy();
      },
      () => {
        session.controller.destroy();
      },
      () => {
        this.arguments_.interactionCoordinator.release(session.interactionToken);
      },
      () => {
        this.arguments_.onSessionEnd?.();
      },
      () => {
        if (this.state.status !== 'destroyed') {
          this.transitionTo({ status: 'idle' });
        }
      },
      () => {
        this.focusCoordinator.completeCleanup();
      },
      () => {
        if (publishClose) {
          dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
            this.arguments_.tableElement,
            'alteditor-lite:close',
            {
              editor: this.arguments_.editor,
              mode: 'inline',
              operation: 'edit',
              reason,
              target: createInlineEventTarget(session.capture.summary),
              type: 'close',
            },
          );
        }
      },
      () => {
        this.arguments_.notifyIntegration();
      },
      () => {
        if (restoreFocus) {
          this.focusCoordinator.restoreOrigin(session);
        }
      },
    ]);
  }

  private throwRejectedResult(result: EditOperationResult<TRow>): void {
    if (result.status === 'failed' || result.status === 'validation-failed') {
      throw result.error;
    }
  }

  private releaseActivationInteraction(): void {
    if (this.activationInteractionToken !== undefined) {
      this.arguments_.interactionCoordinator.release(this.activationInteractionToken);
      this.activationInteractionToken = undefined;
    }
  }

  private transitionTo(nextState: InlineEditState): void {
    assertInlineEditStateTransition(this.state, nextState);
    this.state = Object.freeze(nextState);
    this.arguments_.notifyIntegration();
  }

  private replaceEditingState(
    nextState: Extract<InlineEditState, { readonly status: 'editing' }>,
  ): void {
    if (this.state.status !== 'editing') {
      throw new EditorOperationBusyError();
    }
    this.state = Object.freeze(nextState);
    this.arguments_.notifyIntegration();
  }

  private assertActive(): void {
    if (this.isDestroyed || this.state.status === 'destroyed') {
      throw new EditorDestroyedError();
    }
  }

  private readonly stopOwnedPointerEvent = (event: Event): void => {
    event.stopPropagation();
  };
}
