import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorOperationBusyError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import {
  commitRowUpdateWithFocus,
  resolveLogicalCellTarget,
  type LogicalCellTarget,
} from '../core/editing/commit-row-update.js';
import {
  dispatchEditorEvent,
  type EditorCloseReason,
  type InlineEventTarget,
} from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';
import { isColumnVisiblyAvailable } from '../datatables/column-visibility.js';
import { resolveUniqueRowIndexById } from '../datatables/row-id-resolution.js';
import { EditorAlertDialog } from '../dialog/editor-alert-dialog.js';
import { createFieldController } from '../fields/create-field-controller.js';
import { INLINE_FIELD_PRESENTATION } from '../fields/field-controller-presentation.js';

import { InlineEditPresentationAdapter } from './inline-edit-presentation-adapter.js';
import { assertInlineEditStateTransition } from './inline-edit-state-transition.js';
import {
  focusInlineCellOrTable,
  ownsInlineFocus,
  restoreInlineOriginFocus,
} from './inline-focus-owner.js';
import { InlineFocusStateMachine } from './inline-focus-state-machine.js';
import { resolveInlineKeyboardIntent } from './inline-keyboard.js';
import {
  createInlineNavigationIntent,
  type InlineNavigationIntent,
} from './inline-navigation.js';
import {
  captureInlineTarget,
  type InlineTargetCapture,
} from './inline-target-capture.js';
import { resolveInlineTarget } from './inline-target-resolution.js';
import { buildInlineValues } from './inline-values.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { ResolvedInlineEditorOptions } from './inline-edit-options.js';
import type { InlineEditSession } from './inline-edit-session.js';
import type { InlineEditState, InlineTargetSummary } from './inline-edit-state.js';
import type { InlineEditViewFactory } from './inline-edit-view-factory.js';
import type { InlineFocusRestoreToken } from './inline-focus-state.js';
import type { ResolvedInlineInteractionBehavior } from './inline-interaction-behavior.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  BeforeOpenContext,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { DrawOwnership } from '../core/editing/draw-ownership.js';
import type {
  EditOperationResult,
  EditOperationRunner,
} from '../core/editing/edit-operation-runner.js';
import type {
  InteractionCoordinator,
  InteractionToken,
} from '../core/editing/interaction-coordinator.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldPath } from '../object-path/field-path.js';
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
  readonly options: Readonly<ResolvedInlineEditorOptions<TFormValues>>;
  readonly editorOptions: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly instanceId: string;
  readonly interactionCoordinator: InteractionCoordinator;
  readonly operationOwner: OperationOwner;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly drawOwnership: DrawOwnership<TRow>;
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

function asInlineEventTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<InlineEventTarget> {
  return Object.freeze({ ...summary });
}

function asOperationTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<EditorOperationTarget> {
  return Object.freeze({
    columnIndex: summary.columnIndex,
    fieldNames: Object.freeze([summary.fieldName]),
    rowIndex: summary.rowIndex,
    ...(summary.rowId === undefined ? {} : { rowId: summary.rowId }),
    ...(summary.columnName === undefined ? {} : { columnName: summary.columnName }),
  });
}

/** Owns one inline editing session at a time. */
export class InlineEditSessionController<
  TRow extends object,
  TFormValues extends object,
> {
  private readonly fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>;

  private readonly viewFactory: InlineEditViewFactory<TFormValues>;

  private readonly alertDialog: EditorAlertDialog | undefined;

  private readonly focusStateMachine = new InlineFocusStateMachine();

  private state: InlineEditState;

  private session: InlineEditSession<TRow, TFormValues> | undefined;

  private activationAbortController: AbortController | undefined;

  private activationInteractionToken: InteractionToken | undefined;

  private changeAbortController: AbortController | undefined;

  private postCommitFocusTarget: Readonly<LogicalCellTarget<TRow>> | undefined;

  private nextSessionId = 0;

  private nextAlertId = 0;

  private activeAlertToken: InlineFocusRestoreToken | undefined;

  private isDestroyed = false;

  public constructor(
    private readonly arguments_: InlineEditSessionControllerArguments<TRow, TFormValues>,
  ) {
    this.fieldsByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
      arguments_.fields.map((field) => [field.name, field]),
    );
    this.viewFactory = arguments_.viewFactory;
    this.alertDialog = arguments_.enabled
      ? new EditorAlertDialog(
          arguments_.tableElement,
          `${arguments_.instanceId}-inline`,
          arguments_.language,
        )
      : undefined;
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

    const capture = captureInlineTarget(
      this.arguments_.table,
      this.arguments_.tableElement,
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
    let activationController: ManagedFieldController<TFormValues> | undefined;

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

      resolveInlineTarget(
        this.arguments_.table,
        this.arguments_.tableElement,
        capture,
        this.arguments_.mappings,
        this.arguments_.language.inline.targetUnavailable,
      );

      const controller = createFieldController(
        capture.field,
        `${this.arguments_.instanceId}-inline-${String(capture.summary.rowIndex)}-${String(capture.summary.columnIndex)}`,
        this.arguments_.language,
        this.handleUserChange,
        INLINE_FIELD_PRESENTATION,
      );
      activationController = controller;
      controller.setValue(capture.originalValue);
      const normalizedOriginalValue = await Promise.resolve(
        controller.getValue(activationAbortController.signal),
      );
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Cancellation can occur while an asynchronous controller resolves.
      if (activationAbortController.signal.aborted || this.isDestroyed) {
        controller.destroy();
        activationController = undefined;
        this.releaseActivationInteraction();
        if ((this.state as InlineEditState).status === 'activating') {
          this.transitionTo({ status: 'idle' });
        }
        return;
      }
      resolveInlineTarget(
        this.arguments_.table,
        this.arguments_.tableElement,
        capture,
        this.arguments_.mappings,
        this.arguments_.language.inline.targetUnavailable,
      );

      const fieldId = `${this.arguments_.instanceId}-inline-${String(capture.summary.rowIndex)}-${String(capture.summary.columnIndex)}`;
      const host = this.viewFactory.create(
        {
          ...(this.arguments_.options.className === undefined
            ? {}
            : { className: this.arguments_.options.className }),
          controller,
          field: capture.field,
          fieldId,
          tableElement: this.arguments_.tableElement,
        },
        {
          onCancel: (reason) => {
            void this.cancel(reason);
          },
          onSubmit: () => {
            void this.submit().catch(() => undefined);
          },
        },
      );
      this.session = {
        capture,
        changeRevision: 0,
        controller,
        host,
        interactionToken,
        lifecycleAbortController: new AbortController(),
        normalizedOriginalValue,
        originalActiveElement: document.activeElement,
        sessionId: (this.nextSessionId += 1),
      };
      activationController = undefined;
      this.activationInteractionToken = undefined;
      host.mount(capture.cellNode);
      this.arguments_.onSessionStart?.();
      host.element.addEventListener('keydown', this.handleKeyDown);
      host.element.addEventListener('focusout', this.handleFocusOut);
      host.element.addEventListener('click', this.stopOwnedPointerEvent);
      host.element.addEventListener('dblclick', this.stopOwnedPointerEvent);
      host.element.addEventListener('pointerdown', this.stopOwnedPointerEvent);
      this.transitionTo({ dirty: false, status: 'editing', target: capture.summary });
      this.focusStateMachine.transition({ type: 'session-mounted' });
      host.focus();
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
        this.arguments_.tableElement,
        'alteditor-lite:open',
        {
          editor: this.arguments_.editor,
          mode: 'inline',
          operation: 'edit',
          target: asInlineEventTarget(capture.summary),
          type: 'open',
        },
      );
      this.arguments_.notifyIntegration();
    } catch (rawError: unknown) {
      if (this.session?.capture === capture) {
        this.cleanupSession('api', true, false, false);
      } else {
        activationController?.destroy();
        this.arguments_.interactionCoordinator.release(interactionToken);
      }
      if (this.activationInteractionToken === interactionToken) {
        this.activationInteractionToken = undefined;
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
            target: asOperationTarget(capture.summary),
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

    const candidate = await Promise.resolve(
      session.controller.getValue(session.lifecycleAbortController.signal),
    );
    if (session.lifecycleAbortController.signal.aborted || this.session !== session) {
      return;
    }
    if (Object.is(candidate, session.normalizedOriginalValue)) {
      this.cleanupSession('unchanged', true, true);
      return;
    }
    session.candidate = candidate;
    const target = asOperationTarget(session.capture.summary);
    const navigationIntent = session.navigationIntent;
    const result = await this.arguments_.editOperationRunner.run({
      ...(this.arguments_.editorOptions.hooks?.afterSuccess === undefined
        ? {}
        : {
            afterSuccess: async (context) => {
              await Promise.resolve(
                this.arguments_.editorOptions.hooks?.afterSuccess?.(context),
              );
            },
          }),
      ...(this.arguments_.editorOptions.hooks?.beforeSubmit === undefined
        ? {}
        : {
            beforeSubmit: async (transaction, context) => {
              const shouldContinue = await Promise.resolve(
                this.arguments_.editorOptions.hooks?.beforeSubmit?.(transaction.values, {
                  ...context,
                  original: transaction.original,
                }),
              );
              return shouldContinue !== false;
            },
          }),
      commit: async (row, rowIndex, request) => {
        if (this.arguments_.options.updateMode === 'refresh') {
          await this.arguments_.drawOwnership.runWhile(
            'refresh',
            request.abortController.signal,
            async () => {
              await Promise.resolve(
                this.arguments_.editorOptions.operations?.refresh?.(
                  this.arguments_.operationOwner.context(
                    this.arguments_.table,
                    request,
                    'refresh',
                  ),
                ),
              );
            },
          );
          return Object.freeze({ row });
        }

        const commitResult = await commitRowUpdateWithFocus(
          this.arguments_.table,
          rowIndex,
          row,
          session.capture.column.columnIndex,
          session.capture.column.columnName,
          this.arguments_.drawOwnership,
          request.abortController.signal,
        );
        this.postCommitFocusTarget = commitResult.focusTarget;
        return commitResult;
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          this.arguments_.tableElement,
          'alteditor-lite:submit',
          {
            editor: this.arguments_.editor,
            mode: 'inline',
            operation: 'edit',
            original: transaction.original,
            target: asInlineEventTarget(session.capture.summary),
            type: 'submit',
            values: transaction.values,
          },
        );
      },
      dispatchSuccess: (transaction, commitResult) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
          this.arguments_.tableElement,
          'alteditor-lite:success',
          {
            editor: this.arguments_.editor,
            mode: 'inline',
            operation: 'edit',
            original: transaction.original,
            row: commitResult.row,
            target: asInlineEventTarget(session.capture.summary),
            type: 'success',
            values: transaction.values,
          },
        );
      },
      mode: 'inline',
      original: session.capture.rowCapture.snapshot.original,
      presentation: this.createPresentation(session, navigationIntent),
      reportError: this.arguments_.reportError,
      revalidateTarget: () =>
        resolveInlineTarget(
          this.arguments_.table,
          this.arguments_.tableElement,
          session.capture,
          this.arguments_.mappings,
          this.arguments_.language.inline.targetUnavailable,
        ),
      target,
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
    return !['disabled', 'idle', 'destroyed'].includes(this.state.status);
  }

  /** Removes all listeners and owned DOM resources. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.activationAbortController?.abort();
    this.releaseActivationInteraction();
    this.changeAbortController?.abort();
    this.arguments_.operationOwner.abort('inline');
    this.alertDialog?.destroy();
    this.arguments_.table.off('.altEditorLiteInline');
    if (this.session !== undefined) {
      this.cleanupSession('api', true, ownsInlineFocus(this.session.host.element));
    }
    this.transitionTo({ status: 'destroyed' });
    this.focusStateMachine.transition({ type: 'destroyed' });
  }

  private createPresentation(
    session: InlineEditSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
  ) {
    return new InlineEditPresentationAdapter<TRow, TFormValues>({
      completeSuccess: async () => {
        this.cleanupSession('success', false, false);
        await this.restorePostCommitFocus(session, navigationIntent);
      },
      restoreAfterOperationFailure: () => undefined,
      restoreAfterValidationFailure: () => {
        session.host.setBusy(false);
        if (this.state.status === 'validating') {
          this.transitionTo({
            dirty: true,
            status: 'editing',
            target: session.capture.summary,
          });
        }
        if (
          this.focusStateMachine.current() === 'validating' ||
          this.focusStateMachine.current() === 'submitting'
        ) {
          this.focusStateMachine.transition({
            type: 'operation-returned-to-editing',
          });
        }
        session.host.focus();
      },
      setBusy: (isBusy: boolean) => {
        session.host.setBusy(isBusy);
        if (isBusy && this.state.status === 'validating') {
          this.transitionTo({
            status: 'submitting',
            target: session.capture.summary,
          });
          this.focusStateMachine.transition({ type: 'submission-started' });
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
        await this.showAlert(session, error, 'operation');
      },
      startValidation: () => {
        session.host.setActionBusy?.(true);
        session.controller.clearError();
        session.host.setInvalid(false);
        this.transitionTo({
          status: 'validating',
          target: session.capture.summary,
        });
        this.focusStateMachine.transition({ type: 'validation-started' });
      },
      validate: async (signal: AbortSignal) =>
        await this.validateSession(session, signal),
    });
  }

  private async validateSession(
    session: InlineEditSession<TRow, TFormValues>,
    signal: AbortSignal,
  ) {
    const candidate = session.candidate;
    const values = buildInlineValues(
      this.arguments_.fields,
      session.capture.rowCapture.sourceRow,
      session.capture.field.name,
      candidate,
    );
    const nativeResult = session.controller.validateNative();
    if (!nativeResult.valid) {
      const message = nativeResult.message ?? this.arguments_.language.validation.invalid;
      return await this.validationFailure(session, message);
    }

    const customResult = await session.controller.validateCustom(values, signal);
    signal.throwIfAborted();
    if (!customResult.valid) {
      const message = customResult.message ?? this.arguments_.language.validation.invalid;
      return await this.validationFailure(session, message);
    }

    const uniqueErrors = this.arguments_.validateUnique(
      values,
      session.capture.rowCapture.sourceRow,
    );
    const currentError = uniqueErrors[session.capture.field.name];
    if (currentError !== undefined) {
      return await this.validationFailure(session, currentError);
    }

    await session.pendingChange;
    signal.throwIfAborted();
    if (
      session.pendingChangeError?.revision === session.changeRevision &&
      this.session === session
    ) {
      const changeError = session.pendingChangeError.error;
      return await this.validationFailure(
        session,
        changeError.fieldErrors?.[session.capture.field.name] ?? changeError.message,
        changeError,
      );
    }

    return {
      changedFields: [session.capture.field.name] as FieldPath<TFormValues>[],
      collectedFieldValues: new Map([[session.capture.field.name, candidate]]),
      valid: true as const,
      values,
    };
  }

  private async validationFailure(
    session: InlineEditSession<TRow, TFormValues>,
    message: string,
    existingError?: AltEditorLiteError,
  ) {
    const error =
      existingError ??
      new AltEditorLiteError({
        code: 'VALIDATION',
        fieldErrors: { [session.capture.field.name]: message },
        message,
        retryable: true,
      });
    session.controller.showError(message);
    session.host.setInvalid(true);
    this.transitionTo({
      error,
      status: 'error',
      target: session.capture.summary,
    });
    await this.showAlert(session, error, 'validation');
    return {
      error,
      valid: false as const,
    };
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
      table: this.arguments_.table,
      target: asOperationTarget(capture.summary),
    });
    return (await Promise.resolve(hook(context))) !== false;
  }

  private readonly handleExternalDraw = (): void => {
    if (this.arguments_.drawOwnership.ownsDraw() || !this.isEditing()) {
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
        !this.focusStateMachine.shouldApplyBlurAction() ||
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
      const navigationIntent = createInlineNavigationIntent(
        this.arguments_.table,
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
      if (this.focusStateMachine.current() === 'validating') {
        this.focusStateMachine.transition({
          type: 'operation-returned-to-editing',
        });
      }
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
    const pendingChange = this.runOnChange(
      session,
      abortController.signal,
      revision,
    ).finally(() => {
      if (session.pendingChange === pendingChange) {
        delete session.pendingChange;
      }
    });
    session.pendingChange = pendingChange;
  };

  private async runOnChange(
    session: InlineEditSession<TRow, TFormValues>,
    signal: AbortSignal,
    revision: number,
  ): Promise<void> {
    try {
      const candidate = await Promise.resolve(session.controller.getValue(signal));
      const values = buildInlineValues(
        this.arguments_.fields,
        session.capture.rowCapture.sourceRow,
        session.capture.field.name,
        candidate,
      );
      await session.controller.runOnChange(values, signal);
      if (
        !signal.aborted &&
        this.session === session &&
        revision === session.changeRevision
      ) {
        delete session.pendingChangeError;
      }
    } catch (rawError: unknown) {
      if (
        !signal.aborted &&
        this.session === session &&
        revision === session.changeRevision
      ) {
        const error = normalizeOperationError(rawError, signal, this.arguments_.language);
        if (!(error instanceof InternalOperationAbort)) {
          session.pendingChangeError = { error, revision };
          this.arguments_.reportError(
            error,
            {
              committed: false,
              mode: 'inline',
              operation: 'edit',
              phase: 'validation',
              target: asOperationTarget(session.capture.summary),
            },
            true,
          );
        }
      }
    }
  }

  private async showAlert(
    session: InlineEditSession<TRow, TFormValues>,
    error: AltEditorLiteError,
    kind: 'validation' | 'operation',
  ): Promise<void> {
    if (this.isDestroyed || this.session !== session) {
      return;
    }
    const alertDialog = this.alertDialog;
    if (alertDialog === undefined) {
      return;
    }
    const focusState = this.focusStateMachine.current();
    if (!['editing', 'validating', 'submitting'].includes(focusState)) {
      return;
    }

    this.focusStateMachine.transition({ type: 'alert-requested' });
    const token = Object.freeze({
      alertId: (this.nextAlertId += 1),
      sessionId: session.sessionId,
    });
    this.activeAlertToken = token;
    const fieldMessage = error.fieldErrors?.[session.capture.field.name];
    const unrelatedMessages = Object.entries(error.fieldErrors ?? {})
      .filter(([fieldName]) => fieldName !== session.capture.field.name)
      .map(([, message]) => message);
    const message =
      unrelatedMessages.length > 0
        ? [error.message, ...unrelatedMessages].join(' ')
        : (fieldMessage ?? error.message);
    let alertPromise: Promise<void>;
    try {
      alertPromise = alertDialog.open({
        message,
        title:
          kind === 'validation'
            ? this.arguments_.language.alert.validationTitle
            : this.arguments_.language.alert.operationTitle,
      });
    } catch (error: unknown) {
      this.activeAlertToken = undefined;
      if (
        this.session === session &&
        this.focusStateMachine.current() === 'alert-opening'
      ) {
        this.focusStateMachine.transition({ type: 'alert-open-failed' });
        session.host.focus();
      }
      throw error;
    }
    this.focusStateMachine.transition({ type: 'alert-opened' });
    await alertPromise;

    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Destruction can occur while the modal promise is pending.
      this.isDestroyed ||
      this.session !== session ||
      this.activeAlertToken !== token ||
      this.focusStateMachine.current() !== 'alert-open'
    ) {
      return;
    }
    this.focusStateMachine.transition({ type: 'alert-close-requested' });
    this.focusStateMachine.transition({ type: 'focus-restore-started' });
    const canRestore =
      session.host.element.isConnected &&
      session.host.element.closest('table') === this.arguments_.tableElement;
    if (canRestore) {
      session.host.focus();
    } else {
      focusInlineCellOrTable(
        this.arguments_.table,
        this.arguments_.tableElement,
        undefined,
      );
    }
    this.focusStateMachine.transition({
      type: canRestore ? 'focus-restored' : 'focus-restore-failed',
    });
    this.activeAlertToken = undefined;
  }

  private async restorePostCommitFocus(
    session: InlineEditSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
  ): Promise<void> {
    if (navigationIntent !== undefined) {
      try {
        const navigationRowIndex =
          navigationIntent.rowId === undefined
            ? navigationIntent.rowIndex
            : resolveUniqueRowIndexById(this.arguments_.table, navigationIntent.rowId);
        if (navigationRowIndex === undefined) {
          throw new EditorTargetUnavailableError(
            this.arguments_.language.inline.targetUnavailable,
          );
        }
        await this.open(navigationRowIndex, navigationIntent.columnIndex);
        return;
      } catch {
        // The committed cell or table receives focus below.
      }
    }

    let cellNode: HTMLTableCellElement | undefined;
    try {
      if (this.arguments_.options.updateMode === 'refresh') {
        cellNode = this.resolveRefreshCell(session.capture.summary);
      } else if (this.postCommitFocusTarget !== undefined) {
        cellNode = resolveLogicalCellTarget(
          this.arguments_.table,
          this.postCommitFocusTarget,
          this.arguments_.language.inline.targetUnavailable,
        );
      }
    } catch {
      cellNode = undefined;
    } finally {
      this.postCommitFocusTarget = undefined;
    }
    focusInlineCellOrTable(this.arguments_.table, this.arguments_.tableElement, cellNode);
  }

  private resolveRefreshCell(
    summary: Readonly<InlineTargetSummary>,
  ): HTMLTableCellElement {
    if (summary.rowId === undefined) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const rowIndexById = resolveUniqueRowIndexById(this.arguments_.table, summary.rowId);
    if (rowIndexById === undefined) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const row = this.arguments_.table.row(rowIndexById);
    const rowIndex = row.index();
    const column = this.arguments_.table.column(summary.columnIndex);
    if (
      !row.any() ||
      typeof rowIndex !== 'number' ||
      (summary.columnName !== undefined && column.name() !== summary.columnName) ||
      !isColumnVisiblyAvailable(column) ||
      this.arguments_.mappings.get(summary.columnIndex)?.fieldName !== summary.fieldName
    ) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const cellNode = this.arguments_.table.cell(rowIndex, summary.columnIndex).node();
    if (!(cellNode instanceof HTMLTableCellElement) || !cellNode.isConnected) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    return cellNode;
  }

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
    if (
      this.focusStateMachine.current() !== 'cleanup' &&
      this.focusStateMachine.current() !== 'destroyed'
    ) {
      this.focusStateMachine.transition({ type: 'cleanup-started' });
    }
    this.activeAlertToken = undefined;
    this.alertDialog?.close();
    this.session = undefined;
    session.lifecycleAbortController.abort();
    this.changeAbortController?.abort();
    this.changeAbortController = undefined;
    session.host.element.removeEventListener('keydown', this.handleKeyDown);
    session.host.element.removeEventListener('focusout', this.handleFocusOut);
    session.host.element.removeEventListener('click', this.stopOwnedPointerEvent);
    session.host.element.removeEventListener('dblclick', this.stopOwnedPointerEvent);
    session.host.element.removeEventListener('pointerdown', this.stopOwnedPointerEvent);
    let canRestoreOriginalContent = false;
    if (restoreOriginalContent) {
      try {
        resolveInlineTarget(
          this.arguments_.table,
          this.arguments_.tableElement,
          session.capture,
          this.arguments_.mappings,
          this.arguments_.language.inline.targetUnavailable,
        );
        canRestoreOriginalContent = true;
      } catch {
        canRestoreOriginalContent = false;
      }
    }
    session.host.unmount({ restoreOriginalContent: canRestoreOriginalContent });
    session.host.destroy();
    session.controller.destroy();
    this.arguments_.interactionCoordinator.release(session.interactionToken);
    this.arguments_.onSessionEnd?.();
    if (this.state.status !== 'destroyed') {
      this.transitionTo({ status: 'idle' });
    }
    if (this.focusStateMachine.current() === 'cleanup') {
      this.focusStateMachine.transition({ type: 'cleanup-complete' });
    }
    if (publishClose) {
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
        this.arguments_.tableElement,
        'alteditor-lite:close',
        {
          editor: this.arguments_.editor,
          mode: 'inline',
          operation: 'edit',
          reason,
          target: asInlineEventTarget(session.capture.summary),
          type: 'close',
        },
      );
    }
    this.arguments_.notifyIntegration();

    if (restoreFocus) {
      restoreInlineOriginFocus(session.host.element, session.originalActiveElement);
    }
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
