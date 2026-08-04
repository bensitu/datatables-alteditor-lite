import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorOperationBusyError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import {
  commitRowUpdate,
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
import { createFieldController } from '../fields/create-field-controller.js';

import { InlineCellHost } from './inline-cell-host.js';
import { assertInlineEditStateTransition } from './inline-edit-state-transition.js';
import { isInlineFieldEligible } from './inline-field-capability.js';
import {
  captureInlineTarget,
  type InlineTargetCapture,
} from './inline-target-capture.js';
import { resolveInlineTarget } from './inline-target-resolution.js';
import { buildInlineValues } from './inline-values.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { ResolvedInlineEditorOptions } from './inline-edit-options.js';
import type { InlineEditState, InlineTargetSummary } from './inline-edit-state.js';
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
import type { Api, ColumnSelector, RowSelector, SelectorModifier } from 'datatables.net';

interface InlineSession<TRow extends object, TFormValues extends object> {
  readonly capture: InlineTargetCapture<TRow, TFormValues>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly fragment: DocumentFragment;
  readonly host: InlineCellHost<TFormValues>;
  readonly interactionToken: InteractionToken;
  readonly originalActiveElement: Element | null;
  readonly normalizedOriginalValue: unknown;
  candidate?: unknown;
  navigationIntent?: InlineNavigationIntent;
}

interface InlineNavigationIntent {
  readonly columnIndex: number;
  readonly direction: 'forward' | 'backward';
  readonly rowSelector: number | string;
}

interface InlineControllerArguments<TRow extends object, TFormValues extends object> {
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
}

function isInteractiveDescendant(target: Element): boolean {
  return (
    target.closest(
      'a, button, input, select, textarea, [contenteditable], [data-alteditor-lite-ignore-inline], [data-alteditor-lite-inline]',
    ) !== null
  );
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

/** Owns the optional single-cell inline editing presentation. */
export class InlineEditController<TRow extends object, TFormValues extends object> {
  private readonly fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>;

  private state: InlineEditState;

  private session: InlineSession<TRow, TFormValues> | undefined;

  private activationAbortController: AbortController | undefined;

  private activationInteractionToken: InteractionToken | undefined;

  private changeAbortController: AbortController | undefined;

  private postCommitFocusTarget: Readonly<LogicalCellTarget<TRow>> | undefined;

  private isDestroyed = false;

  public constructor(
    private readonly arguments_: InlineControllerArguments<TRow, TFormValues>,
  ) {
    this.fieldsByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
      arguments_.fields.map((field) => [field.name, field]),
    );
    this.state = arguments_.options.enabled
      ? Object.freeze({ status: 'idle' })
      : Object.freeze({ status: 'disabled' });

    if (arguments_.options.enabled) {
      if (arguments_.options.activation !== 'none') {
        arguments_.tableElement.addEventListener(
          arguments_.options.activation,
          this.handleActivation,
        );
      }
      arguments_.table.on('draw.altEditorLiteInline', this.handleExternalDraw);
      arguments_.table.on(
        'column-visibility.altEditorLiteInline column-reorder.altEditorLiteInline',
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
    if (!this.arguments_.options.enabled) {
      throw new EditorConfigurationError('Inline editing is disabled.');
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

      const fragment = document.createDocumentFragment();
      const controller = createFieldController(
        capture.field,
        `${this.arguments_.instanceId}-inline-${String(capture.summary.rowIndex)}-${String(capture.summary.columnIndex)}`,
        this.arguments_.language,
        this.handleUserChange,
      );
      controller.setValue(capture.originalValue);
      const normalizedOriginalValue = await Promise.resolve(
        controller.getValue(activationAbortController.signal),
      );
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Cancellation can occur while an asynchronous controller resolves.
      if (activationAbortController.signal.aborted || this.isDestroyed) {
        controller.destroy();
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

      const host = new InlineCellHost(
        controller,
        capture.field,
        `${this.arguments_.instanceId}-inline-${String(capture.summary.rowIndex)}-${String(capture.summary.columnIndex)}`,
        this.arguments_.language,
        this.arguments_.options.className,
      );
      while (capture.cellNode.firstChild !== null) {
        fragment.append(capture.cellNode.firstChild);
      }
      capture.cellNode.classList.add('alteditor-lite-cell--editing');
      capture.cellNode.append(host.element);
      host.element.addEventListener('keydown', this.handleKeyDown);
      host.element.addEventListener('focusout', this.handleFocusOut);
      host.element.addEventListener('click', this.stopOwnedPointerEvent);
      host.element.addEventListener('dblclick', this.stopOwnedPointerEvent);
      host.element.addEventListener('pointerdown', this.stopOwnedPointerEvent);
      this.session = {
        capture,
        controller,
        fragment,
        host,
        interactionToken,
        normalizedOriginalValue,
        originalActiveElement: document.activeElement,
      };
      this.activationInteractionToken = undefined;
      this.transitionTo({ dirty: false, status: 'editing', target: capture.summary });
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
      this.arguments_.interactionCoordinator.release(interactionToken);
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

    const candidate = await Promise.resolve(session.controller.getValue());
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
          await this.arguments_.drawOwnership.runWhile('refresh', async () => {
            await Promise.resolve(
              this.arguments_.editorOptions.operations?.refresh?.(
                this.arguments_.operationOwner.context(
                  this.arguments_.table,
                  request,
                  'refresh',
                ),
              ),
            );
          });
          return Object.freeze({ row });
        }

        const commitResult = await commitRowUpdate(
          this.arguments_.table,
          rowIndex,
          row,
          session.capture.column.columnIndex,
          session.capture.column.columnName,
          this.arguments_.drawOwnership,
          request.abortController.signal,
          'inline-edit-success',
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
    if (this.arguments_.options.activation !== 'none') {
      this.arguments_.tableElement.removeEventListener(
        this.arguments_.options.activation,
        this.handleActivation,
      );
    }
    this.arguments_.table.off('.altEditorLiteInline');
    if (this.session !== undefined) {
      this.cleanupSession('api', true, false);
    }
    this.transitionTo({ status: 'destroyed' });
  }

  private createPresentation(
    session: InlineSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
  ) {
    return {
      completeSuccess: async () => {
        this.cleanupSession('success', false, false);
        await this.restorePostCommitFocus(session, navigationIntent);
      },
      restoreAfterOperationFailure: () => undefined,
      restoreAfterValidationFailure: () => {
        session.host.setBusy(false, this.arguments_.language);
        if (this.state.status === 'validating') {
          this.transitionTo({
            dirty: true,
            status: 'editing',
            target: session.capture.summary,
          });
        }
        session.host.focus();
      },
      setBusy: (isBusy: boolean) => {
        session.host.setBusy(isBusy, this.arguments_.language);
        if (isBusy && this.state.status === 'validating') {
          this.transitionTo({
            status: 'submitting',
            target: session.capture.summary,
          });
        }
      },
      showOperationError: (error: AltEditorLiteError) => {
        const fieldMessage = error.fieldErrors?.[session.capture.field.name];
        if (fieldMessage !== undefined) {
          session.controller.showError(fieldMessage);
        }
        const unrelatedMessages = Object.entries(error.fieldErrors ?? {})
          .filter(([fieldName]) => fieldName !== session.capture.field.name)
          .map(([, message]) => message);
        session.host.showError(
          unrelatedMessages.length > 0
            ? `${error.message} ${unrelatedMessages.join(' ')}`
            : error.message,
        );
        this.transitionTo({
          error,
          status: 'error',
          target: session.capture.summary,
        });
      },
      startValidation: () => {
        session.controller.clearError();
        session.host.clearError();
        this.transitionTo({
          status: 'validating',
          target: session.capture.summary,
        });
      },
      validate: async (signal: AbortSignal) =>
        await this.validateSession(session, signal),
    };
  }

  private async validateSession(
    session: InlineSession<TRow, TFormValues>,
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
      session.controller.showError(message);
      return this.validationFailure(session.capture.field.name, message);
    }

    const customResult = await session.controller.validateCustom(values, signal);
    signal.throwIfAborted();
    if (!customResult.valid) {
      const message = customResult.message ?? this.arguments_.language.validation.invalid;
      session.controller.showError(message);
      return this.validationFailure(session.capture.field.name, message);
    }

    const uniqueErrors = this.arguments_.validateUnique(
      values,
      session.capture.rowCapture.sourceRow,
    );
    const currentError = uniqueErrors[session.capture.field.name];
    if (currentError !== undefined) {
      session.controller.showError(currentError);
      return this.validationFailure(session.capture.field.name, currentError);
    }

    return {
      changedFields: [session.capture.field.name] as FieldPath<TFormValues>[],
      collectedFieldValues: new Map([[session.capture.field.name, candidate]]),
      valid: true as const,
      values,
    };
  }

  private validationFailure(fieldName: string, message: string) {
    return {
      error: new AltEditorLiteError({
        code: 'VALIDATION',
        fieldErrors: { [fieldName]: message },
        message,
        retryable: true,
      }),
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

  private readonly handleActivation = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || isInteractiveDescendant(target)) {
      return;
    }
    const cellNode = target.closest<HTMLTableCellElement>('tbody td, tbody th');
    if (cellNode?.closest('table') !== this.arguments_.tableElement) {
      return;
    }
    const cellIndex = this.arguments_.table.cell(cellNode).index();
    if (!this.arguments_.mappings.has(cellIndex.column)) {
      return;
    }
    void this.open(cellIndex.row, cellIndex.column).catch(() => undefined);
  };

  private readonly handleExternalDraw = (): void => {
    if (this.arguments_.drawOwnership.ownsDraw() || !this.isEditing()) {
      return;
    }
    this.activationAbortController?.abort();
    this.releaseActivationInteraction();
    this.changeAbortController?.abort();
    this.arguments_.operationOwner.abort('inline');
    if (this.session !== undefined) {
      this.cleanupSession('redraw', false, false);
    } else if (this.state.status === 'activating') {
      this.transitionTo({ status: 'idle' });
    }
  };

  private readonly handleFocusOut = (): void => {
    queueMicrotask(() => {
      const session = this.session;
      if (
        session === undefined ||
        session.host.element.contains(document.activeElement) ||
        this.state.status === 'submitting'
      ) {
        return;
      }
      if (this.arguments_.options.blurAction === 'submit') {
        void this.submit().catch(() => undefined);
      } else if (this.arguments_.options.blurAction === 'cancel') {
        void this.cancel('cancel');
      }
    });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    const session = this.session;
    if (session === undefined) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void this.cancel('escape');
      return;
    }
    if (event.key === 'Tab' && this.arguments_.options.tabAction !== 'none') {
      event.preventDefault();
      event.stopPropagation();
      if (this.arguments_.options.tabAction === 'submit-and-move') {
        const navigationIntent = this.createNavigationIntent(
          session,
          event.shiftKey ? 'backward' : 'forward',
        );
        if (navigationIntent === undefined) {
          delete session.navigationIntent;
        } else {
          session.navigationIntent = navigationIntent;
        }
      }
      void this.submit().catch(() => undefined);
      return;
    }
    if (event.key !== 'Enter' || this.arguments_.options.enterAction === 'none') {
      return;
    }
    if (session.capture.field.type === 'textarea' && !event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.submit().catch(() => undefined);
  };

  private readonly handleUserChange = (): void => {
    const session = this.session;
    if (session === undefined) {
      return;
    }
    if (this.state.status === 'validating') {
      this.arguments_.operationOwner.abort('inline');
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
    }
    this.changeAbortController?.abort();
    const abortController = new AbortController();
    this.changeAbortController = abortController;
    void this.runOnChange(session, abortController.signal);
  };

  private async runOnChange(
    session: InlineSession<TRow, TFormValues>,
    signal: AbortSignal,
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
    } catch (rawError: unknown) {
      if (!signal.aborted && this.session === session) {
        const error = normalizeOperationError(rawError, signal, this.arguments_.language);
        if (!(error instanceof InternalOperationAbort)) {
          session.host.showError(error.message);
        }
      }
    }
  }

  private createNavigationIntent(
    session: InlineSession<TRow, TFormValues>,
    direction: 'forward' | 'backward',
  ): InlineNavigationIntent | undefined {
    const modifier: SelectorModifier = { page: 'current' };
    const rowIndexes = this.arguments_.table.rows(modifier).indexes().toArray();
    const columnIndexes = this.arguments_.table
      .columns(':visible')
      .indexes()
      .toArray()
      .filter((columnIndex) => {
        const mapping = this.arguments_.mappings.get(columnIndex);
        const field =
          mapping === undefined ? undefined : this.fieldsByName.get(mapping.fieldName);
        return field !== undefined && isInlineFieldEligible(field);
      });
    const cells = rowIndexes.flatMap((rowIndex) =>
      columnIndexes.map((columnIndex) => ({ columnIndex, rowIndex })),
    );
    const currentIndex = cells.findIndex(
      (cell) =>
        cell.rowIndex === session.capture.summary.rowIndex &&
        cell.columnIndex === session.capture.summary.columnIndex,
    );
    const nextIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    const next = cells[nextIndex];
    if (currentIndex < 0 || next === undefined) {
      return undefined;
    }

    const rowApi = this.arguments_.table.row(next.rowIndex);
    const rowId = rowApi.id();
    const hasStableRowId =
      typeof rowId === 'string' &&
      rowId.length > 0 &&
      this.arguments_.table.row(`#${rowId}`).any();
    return Object.freeze({
      columnIndex: next.columnIndex,
      direction,
      rowSelector: hasStableRowId ? `#${rowId}` : next.rowIndex,
    });
  }

  private async restorePostCommitFocus(
    session: InlineSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
  ): Promise<void> {
    if (navigationIntent !== undefined) {
      try {
        await this.open(navigationIntent.rowSelector, navigationIntent.columnIndex);
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
    this.focusCellOrTable(cellNode);
  }

  private resolveRefreshCell(
    summary: Readonly<InlineTargetSummary>,
  ): HTMLTableCellElement {
    if (summary.rowId === undefined) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const row = this.arguments_.table.row(`#${summary.rowId}`);
    const rowIndex = row.index();
    const column = this.arguments_.table.column(summary.columnIndex);
    if (
      !row.any() ||
      typeof rowIndex !== 'number' ||
      (summary.columnName !== undefined && column.name() !== summary.columnName) ||
      !column.visible() ||
      this.arguments_.mappings.get(summary.columnIndex)?.fieldName !== summary.fieldName
    ) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    return this.arguments_.table.cell(rowIndex, summary.columnIndex).node();
  }

  private focusCellOrTable(cellNode: HTMLTableCellElement | undefined): void {
    if (cellNode?.isConnected === true) {
      const cellApi = this.arguments_.table.cell(cellNode) as unknown as {
        focus?: () => unknown;
      };
      if (typeof cellApi.focus === 'function') {
        cellApi.focus();
        return;
      }
      if (cellNode.tabIndex < 0) {
        cellNode.tabIndex = -1;
      }
      cellNode.focus();
      return;
    }
    if (this.arguments_.tableElement.tabIndex < 0) {
      this.arguments_.tableElement.tabIndex = -1;
    }
    this.arguments_.tableElement.focus();
  }

  private cleanupSession(
    reason: EditorCloseReason,
    restoreFragment: boolean,
    restoreFocus: boolean,
  ): void {
    const session = this.session;
    if (session === undefined) {
      return;
    }
    this.session = undefined;
    this.changeAbortController?.abort();
    this.changeAbortController = undefined;
    session.host.element.removeEventListener('keydown', this.handleKeyDown);
    session.host.element.removeEventListener('focusout', this.handleFocusOut);
    session.host.element.removeEventListener('click', this.stopOwnedPointerEvent);
    session.host.element.removeEventListener('dblclick', this.stopOwnedPointerEvent);
    session.host.element.removeEventListener('pointerdown', this.stopOwnedPointerEvent);
    session.controller.destroy();

    let safeCell: HTMLTableCellElement | undefined;
    if (restoreFragment) {
      try {
        resolveInlineTarget(
          this.arguments_.table,
          this.arguments_.tableElement,
          session.capture,
          this.arguments_.mappings,
          this.arguments_.language.inline.targetUnavailable,
        );
        safeCell = session.capture.cellNode;
        safeCell.replaceChildren(session.fragment);
      } catch {
        session.fragment.replaceChildren();
      }
    } else {
      session.fragment.replaceChildren();
    }
    safeCell?.classList.remove('alteditor-lite-cell--editing');
    session.host.element.remove();
    this.arguments_.interactionCoordinator.release(session.interactionToken);
    if (this.state.status !== 'destroyed') {
      this.transitionTo({ status: 'idle' });
    }
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
    this.arguments_.notifyIntegration();

    if (
      restoreFocus &&
      session.originalActiveElement instanceof HTMLElement &&
      session.originalActiveElement.isConnected &&
      !session.host.element.contains(session.originalActiveElement)
    ) {
      session.originalActiveElement.focus();
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
