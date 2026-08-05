import { dispatchEditorIntegrationUpdate } from '../datatables/editor-integration-event.js';
import { refreshDataTable } from '../datatables/refresh-data-table.js';
import {
  createEditorButtonState,
  type EditorButtonState,
} from '../datatables/register-editor-buttons.js';
import {
  captureEditTarget,
  captureRemoveTargets,
  resolveEditTarget,
  resolveRemoveTargets,
  type EditTargetCapture,
  type RemoveTargetCapture,
} from '../datatables/row-target-resolution.js';
import { SelectIntegration } from '../datatables/select-integration.js';
import { createRemoveConfirmation } from '../dialog/create-remove-confirmation.js';
import { EditorDialog } from '../dialog/editor-dialog.js';
import { validateFieldConfigurations } from '../fields/validate-field-configurations.js';
import { buildEditorForm } from '../form/build-editor-form.js';
import { createInlineColumnMappings } from '../inline/inline-column-mapping.js';
import { InlineEditController } from '../inline/inline-edit-controller.js';
import { resolveInlineOptions } from '../inline/inline-edit-options.js';
import { validateInlineConfiguration } from '../inline/validate-inline-configuration.js';
import { createInstanceId } from '../instance/create-instance-id.js';
import {
  deleteEditorInstance,
  storeEditorInstance,
} from '../instance/editor-instance-store.js';
import { parseFieldPath } from '../object-path/field-path.js';
import { lookupPathSegments } from '../object-path/get-path-value.js';

import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorOperationBusyError,
  EditorSelectionCountError,
} from './alt-editor-lite-error.js';
import {
  resolveLanguage,
  type AltEditorLiteLanguage,
} from './alt-editor-lite-language.js';
import { commitRowUpdate } from './editing/commit-row-update.js';
import { DrawOwnership } from './editing/draw-ownership.js';
import { EditOperationRunner } from './editing/edit-operation-runner.js';
import {
  InteractionCoordinator,
  type InteractionToken,
} from './editing/interaction-coordinator.js';
import { OperationOwner, type OwnedOperationRequest } from './editing/operation-owner.js';
import { dispatchEditorEvent, type EditorCloseReason } from './editor-event.js';
import { assertEditorStateTransition } from './editor-state-transition.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from './error-normalization.js';
import { freezeEditorValues } from './freeze-editor-values.js';
import { validateHooksConfiguration } from './validate-hooks-configuration.js';
import { validateOperationConfiguration } from './validate-operation-configuration.js';

import type {
  AfterSuccessContext,
  AltEditorLiteOptions,
  BeforeOpenContext,
  EditorErrorHookContext,
  OperationContext,
} from './alt-editor-lite-options.js';
import type {
  DialogAction,
  EditorOperation,
  EditorOperationTarget,
} from './editor-operation.js';
import type { EditorState } from './editor-state.js';
import type { DeepPartial, EditorValues } from './editor-values.js';
import type { FieldController } from '../fields/field-controller.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { InlineEditState } from '../inline/inline-edit-state.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

interface UniqueFieldLookup {
  readonly name: string;
  readonly pathSegments: readonly string[];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function normalizeRejectedReason(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('AltEditorLite failed with a non-Error value.', {
        cause: error,
      });
}

function assertCompleteRow(
  rowCandidate: unknown,
  callbackName: string,
): asserts rowCandidate is object {
  if (
    typeof rowCandidate !== 'object' ||
    rowCandidate === null ||
    Array.isArray(rowCandidate)
  ) {
    throw new EditorConfigurationError(
      `${callbackName} must return a complete row object.`,
    );
  }
}

/**
 * Lightweight native CRUD editor bound to one DataTables API instance.
 */
export class AltEditorLite<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> {
  private readonly dialog: EditorDialog;

  private readonly instanceId = createInstanceId();

  private readonly language: Readonly<AltEditorLiteLanguage>;

  private readonly inlineController: InlineEditController<TRow, TFormValues>;

  private readonly interactionCoordinator = new InteractionCoordinator();

  private readonly operationOwner = new OperationOwner();

  private readonly drawOwnership: DrawOwnership<TRow>;

  private readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;

  private readonly selectIntegration: SelectIntegration<TRow>;

  private readonly tableElement: HTMLTableElement;

  private readonly uniqueFieldLookups: readonly UniqueFieldLookup[];

  private activeForm: EditorFormController<TFormValues> | undefined;

  private dialogInteractionToken: InteractionToken | undefined;

  private refreshInteractionToken: InteractionToken | undefined;

  private activeOpenAbortController: AbortController | undefined;

  private editTargetCapture: EditTargetCapture<TRow> | undefined;

  private removeTargetCapture: RemoveTargetCapture<TRow> | undefined;

  private state: EditorState = { status: 'ready' };

  /**
   * Creates the sole active editor for a DataTables table.
   *
   * @param table - Public DataTables API for the owned table.
   * @param options - Fields, persistence operations, and UI configuration.
   * @throws EditorAlreadyInitializedError when the table already has an editor.
   * @throws EditorConfigurationError for invalid or conflicting configuration.
   */
  public constructor(
    private readonly table: Api<TRow>,
    private readonly options: AltEditorLiteOptions<TRow, TFormValues>,
  ) {
    validateFieldConfigurations(options.fields);
    validateOperationConfiguration(options);
    validateHooksConfiguration(options);
    validateInlineConfiguration(table, options);
    this.uniqueFieldLookups = Object.freeze(
      options.fields
        .filter((field) => field.unique === true)
        .map((field) => ({
          name: field.name,
          pathSegments: parseFieldPath(field.name),
        })),
    );
    this.language = resolveLanguage(options.language);
    this.tableElement = table.table().node();
    this.drawOwnership = new DrawOwnership(table);
    this.editOperationRunner = new EditOperationRunner(
      table,
      this.operationOwner,
      this.language,
      options.operations,
      options.clientSide,
    );
    storeEditorInstance(this.tableElement, this);

    try {
      this.dialog = new EditorDialog(this.tableElement, this.instanceId, this.language);
      this.selectIntegration = new SelectIntegration(this.table, () => {
        dispatchEditorIntegrationUpdate(this.tableElement);
      });
      const inlineOptions = resolveInlineOptions(options.inline);
      const inlineMappings = createInlineColumnMappings(
        table,
        options.fields,
        inlineOptions,
      );
      this.inlineController = new InlineEditController({
        drawOwnership: this.drawOwnership,
        editOperationRunner: this.editOperationRunner,
        editor: this,
        editorOptions: options,
        fields: options.fields,
        instanceId: this.instanceId,
        interactionCoordinator: this.interactionCoordinator,
        language: this.language,
        mappings: inlineMappings,
        notifyIntegration: () => {
          dispatchEditorIntegrationUpdate(this.tableElement);
        },
        operationOwner: this.operationOwner,
        options: inlineOptions,
        reportError: (error, context, publishEvent) => {
          this.reportOperationError(error, context, publishEvent);
        },
        table,
        tableElement: this.tableElement,
        validateUnique: (values, excludedRow) =>
          this.validateLocalUniquenessForRow(values, excludedRow),
      });
    } catch (error: unknown) {
      deleteEditorInstance(this.tableElement, this);
      throw error;
    }

    dispatchEditorIntegrationUpdate(this.tableElement);
  }

  /**
   * Opens the Create dialog.
   *
   * Create uses `operations.create`, then `clientSide.createRow`. Configuring
   * neither leaves the capability unavailable.
   *
   * @returns A promise resolved after the modal is open and focused.
   * @throws EditorConfigurationError when Create has no configured owner.
   * @throws EditorOperationBusyError unless the editor is ready.
   */
  public async openCreateDialog(): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      this.acquireDialogInteraction();
      if (!this.hasCreateCapability()) {
        throw new EditorConfigurationError(
          'Create requires operations.create or clientSide.createRow.',
        );
      }

      if (!(await this.runDialogBeforeOpen('create'))) {
        this.releaseDialogInteraction();
        return;
      }
      this.openFormDialog('create');
    } catch (error: unknown) {
      this.releaseDialogInteraction();
      throw normalizeRejectedReason(error);
    }
  }

  /**
   * Opens an Edit dialog for one explicit or currently selected row.
   *
   * @param rowSelector - Public DataTables selector. When omitted, Select must
   * resolve exactly one row.
   * @returns A promise resolved after the snapshot is populated and focused.
   */
  public async openEditDialog(rowSelector?: RowSelector<TRow>): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      this.acquireDialogInteraction();
      const rowIndexes = this.resolveRequestedRowIndexes(rowSelector);
      if (rowIndexes.length !== 1) {
        throw new EditorSelectionCountError(
          'exactly-one',
          rowIndexes.length,
          this.language.errors.singleSelectionRequired,
        );
      }

      const rowIndex = rowIndexes[0];
      if (rowIndex === undefined) {
        throw new EditorSelectionCountError(
          'exactly-one',
          0,
          this.language.errors.singleSelectionRequired,
        );
      }

      this.editTargetCapture = captureEditTarget(
        this.table,
        rowIndex,
        this.language.errors.targetUnavailable,
      );
      const target = this.createDialogEditTarget(this.editTargetCapture);
      if (
        !(await this.runDialogBeforeOpen(
          'edit',
          this.editTargetCapture.snapshot.original,
          target,
        ))
      ) {
        this.editTargetCapture = undefined;
        this.releaseDialogInteraction();
        return;
      }
      resolveEditTarget(
        this.table,
        this.tableElement,
        this.editTargetCapture,
        this.language.errors.targetUnavailable,
      );
      try {
        this.openFormDialog('edit', this.editTargetCapture.snapshot.original);
      } catch (error: unknown) {
        this.editTargetCapture = undefined;
        throw error;
      }
    } catch (error: unknown) {
      this.releaseDialogInteraction();
      throw normalizeRejectedReason(error);
    }
  }

  /**
   * Opens mandatory Remove confirmation for explicit or selected rows.
   *
   * @param rowSelectors - Public DataTables selector. When omitted, Select must
   * resolve one or more rows.
   * @returns A promise resolved after confirmation is open and focused.
   */
  public async openRemoveDialog(rowSelectors?: RowSelector<TRow>): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      this.acquireDialogInteraction();
      const rowIndexes = this.resolveRequestedRowIndexes(rowSelectors);
      if (rowIndexes.length === 0) {
        throw new EditorSelectionCountError(
          'one-or-more',
          0,
          this.language.errors.selectionRequired,
        );
      }

      this.removeTargetCapture = captureRemoveTargets(
        this.table,
        rowIndexes,
        this.language.errors.targetUnavailable,
      );
      if (!(await this.runDialogBeforeOpen('remove'))) {
        this.removeTargetCapture = undefined;
        this.releaseDialogInteraction();
        return;
      }
      resolveRemoveTargets(
        this.table,
        this.tableElement,
        this.removeTargetCapture,
        this.language.errors.targetUnavailable,
      );
      this.transitionTo({ action: 'remove', status: 'opening' });
      const confirmationElement = createRemoveConfirmation(
        rowIndexes.length,
        this.language,
      );

      try {
        this.dialog.openConfirmation(
          confirmationElement,
          this.language.dialog.removeTitle,
          this.language.actions.remove,
          {
            onRequestClose: (reason) => {
              this.closeDialogNow(reason);
            },
            onSubmit: () => {
              this.beginDialogSubmission();
            },
          },
        );
      } catch (error: unknown) {
        confirmationElement.remove();
        this.removeTargetCapture = undefined;
        this.transitionTo({ status: 'ready' });
        throw error;
      }

      this.transitionTo({ action: 'remove', status: 'open' });
      this.dispatchOpenEvent('remove');
    } catch (error: unknown) {
      this.releaseDialogInteraction();
      throw normalizeRejectedReason(error);
    }
  }

  /**
   * Refreshes the table without opening a dialog.
   *
   * `operations.refresh` takes precedence. Otherwise, Ajax-backed tables use
   * `ajax.reload` and other tables use `draw(false)`.
   * Refresh is mutually exclusive with every dialog lifecycle.
   *
   * @returns A promise settled after the current public refresh completes.
   */
  public refreshTable(): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      this.refreshInteractionToken = this.interactionCoordinator.acquire('refresh');
      return this.runRefresh();
    } catch (error: unknown) {
      this.releaseRefreshInteraction();
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Closes an open dialog after aborting owned submission work.
   *
   * @returns A promise resolved after close observers have been notified.
   * @throws EditorOperationBusyError when no dialog can be closed.
   */
  public closeDialog(): Promise<void> {
    try {
      this.assertActive();
      this.closeDialogNow('api');
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Retrieves a rendered field controller by safe path.
   *
   * @param name - Configured field path.
   * @returns Typed controller while a form is open, otherwise null.
   */
  public getField<TValue = unknown>(
    name: FieldPath<TFormValues>,
  ): FieldController<TValue> | null {
    this.assertActive();
    return (this.activeForm?.getField(name) ?? null) as FieldController<TValue> | null;
  }

  /**
   * Returns the current readonly lifecycle state.
   *
   * @returns Current editor state.
   */
  public getState(): Readonly<EditorState> {
    this.assertActive();
    return this.state;
  }

  /** Opens one eligible cell through unique public DataTables selectors. */
  public async openInlineEdit(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void> {
    try {
      this.assertActive();
      await this.inlineController.open(rowSelector, columnSelector);
    } catch (error: unknown) {
      throw normalizeRejectedReason(error);
    }
  }

  /** Validates and submits the active inline candidate. */
  public submitInlineEdit(): Promise<void> {
    try {
      this.assertActive();
      return this.inlineController.submit();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Cancels the active inline session and safely restores cell content. */
  public cancelInlineEdit(): Promise<void> {
    try {
      this.assertActive();
      return this.inlineController.cancel('api');
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Returns the independent inline presentation state. */
  public getInlineState(): Readonly<InlineEditState> {
    this.assertActive();
    return this.inlineController.getState();
  }

  /** Returns whether inline activation, validation, or submission is active. */
  public isInlineEditing(): boolean {
    this.assertActive();
    return this.inlineController.isEditing();
  }

  /**
   * Aborts owned work, removes DOM and listeners, releases the table, and emits
   * destroy once.
   */
  public destroy(): void {
    if (this.state.status === 'destroyed') {
      return;
    }

    this.interactionCoordinator.destroy();
    this.activeOpenAbortController?.abort();
    this.operationOwner.destroy();
    this.drawOwnership.destroy();
    this.inlineController.destroy();
    this.activeForm?.destroy();
    this.activeForm = undefined;
    this.editTargetCapture = undefined;
    this.removeTargetCapture = undefined;
    this.selectIntegration.destroy();
    this.dialog.destroy();
    this.transitionTo({ status: 'destroyed' });
    deleteEditorInstance(this.tableElement, this);
    dispatchEditorIntegrationUpdate(this.tableElement);
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:destroy'>(
      this.tableElement,
      'alteditor-lite:destroy',
      {
        editor: this,
        mode: 'api',
        type: 'destroy',
      },
    );
  }

  private assertActive(): void {
    if (this.state.status === 'destroyed') {
      throw new EditorDestroyedError();
    }
  }

  private assertReady(): void {
    if (
      this.state.status !== 'ready' ||
      this.interactionCoordinator.current() !== 'none'
    ) {
      throw new EditorOperationBusyError();
    }
  }

  private acquireDialogInteraction(): void {
    this.dialogInteractionToken = this.interactionCoordinator.acquire('dialog');
    dispatchEditorIntegrationUpdate(this.tableElement);
  }

  private releaseDialogInteraction(): void {
    if (this.dialogInteractionToken !== undefined) {
      this.interactionCoordinator.release(this.dialogInteractionToken);
      this.dialogInteractionToken = undefined;
      dispatchEditorIntegrationUpdate(this.tableElement);
    }
  }

  private releaseRefreshInteraction(): void {
    if (this.refreshInteractionToken !== undefined) {
      this.interactionCoordinator.release(this.refreshInteractionToken);
      this.refreshInteractionToken = undefined;
      dispatchEditorIntegrationUpdate(this.tableElement);
    }
  }

  private async runDialogBeforeOpen(
    operation: DialogAction,
    row?: Readonly<TRow>,
    target?: Readonly<EditorOperationTarget>,
  ): Promise<boolean> {
    const hook = this.options.hooks?.beforeOpen;
    if (hook === undefined) {
      return true;
    }

    const abortController = new AbortController();
    this.activeOpenAbortController = abortController;
    const context: BeforeOpenContext<TRow, TFormValues> = Object.freeze({
      mode: 'dialog',
      operation,
      signal: abortController.signal,
      table: this.table,
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
        this.language,
      );
      if (!(error instanceof InternalOperationAbort)) {
        this.reportOperationError(
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
      }
      throw error;
    } finally {
      if (this.activeOpenAbortController === abortController) {
        this.activeOpenAbortController = undefined;
      }
    }
  }

  private hasCreateCapability(): boolean {
    return (
      this.options.operations?.create !== undefined ||
      this.options.clientSide?.createRow !== undefined
    );
  }

  private resolveRequestedRowIndexes(
    rowSelector: RowSelector<TRow> | undefined,
  ): readonly number[] {
    if (rowSelector === undefined) {
      return this.selectIntegration.selectedRowIndexes(
        this.language.buttons.selectUnavailable,
      );
    }

    return this.table.rows(rowSelector).indexes().toArray();
  }

  private openFormDialog(
    action: Extract<DialogAction, 'create' | 'edit'>,
    sourceValues?: Readonly<object>,
  ): void {
    this.transitionTo({ action, status: 'opening' });
    let form: EditorFormController<TFormValues> | undefined;

    try {
      form = buildEditorForm(
        this.options.fields,
        this.instanceId,
        this.language,
        (values) => this.validateLocalUniqueness(action, values),
      );
      this.activeForm = form;

      if (sourceValues !== undefined) {
        form.populateFromSource(sourceValues);
      }

      this.dialog.openForm(
        form.element,
        action === 'create'
          ? this.language.dialog.createTitle
          : this.language.dialog.editTitle,
        this.language.actions.submit,
        {
          onRequestClose: (reason) => {
            this.closeDialogNow(reason);
          },
          onSubmit: () => {
            this.beginDialogSubmission();
          },
        },
      );
    } catch (rawError: unknown) {
      this.dialog.close();
      form?.destroy();
      this.activeForm = undefined;
      this.transitionTo({ status: 'ready' });
      const normalizedError = normalizeOperationError(
        rawError,
        new AbortController().signal,
        this.language,
      );
      const openingError =
        normalizedError instanceof InternalOperationAbort
          ? new AltEditorLiteError({
              cause: rawError,
              code: 'UNKNOWN',
              message: this.language.errors.generic,
              retryable: false,
            })
          : normalizedError;
      this.reportOperationError(
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

    this.transitionTo({ action, status: 'open' });
    this.dispatchOpenEvent(action);
  }

  private dispatchOpenEvent(action: DialogAction): void {
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
      this.tableElement,
      'alteditor-lite:open',
      {
        editor: this,
        mode: 'dialog',
        operation: action,
        type: 'open',
      },
    );
  }

  private beginDialogSubmission(): void {
    if (this.state.status !== 'open') {
      return;
    }

    switch (this.state.action) {
      case 'create':
        void this.submitCreate();
        break;
      case 'edit':
        void this.submitEdit();
        break;
      case 'remove':
        void this.submitRemove();
        break;
    }
  }

  private beginOperation(operation: EditorOperation): OwnedOperationRequest {
    return this.operationOwner.begin(
      operation,
      operation === 'refresh' ? 'api' : 'dialog',
    );
  }

  private ownsOperation(request: OwnedOperationRequest): boolean {
    return this.operationOwner.owns(request);
  }

  private releaseOperation(request: OwnedOperationRequest): void {
    this.operationOwner.complete(request);
  }

  private abortActiveOperation(): void {
    this.operationOwner.abort();
  }

  private operationContext(request: OwnedOperationRequest): OperationContext<TRow> {
    return this.operationOwner.context(this.table, request);
  }

  private setSubmitting(action: DialogAction): OwnedOperationRequest {
    this.setDialogSubmitting(action);
    return this.beginOperation(action);
  }

  private setDialogSubmitting(action: DialogAction): void {
    this.transitionTo({ action, status: 'submitting' });
    this.activeForm?.setBusy(true);
    this.dialog.setSubmitAvailable(true);
    this.dialog.setBusy(true);
    this.activeForm?.clearErrors();
    this.dialog.clearError();
  }

  private restoreOpenAfterValidation(
    action: Extract<DialogAction, 'create' | 'edit'>,
    request: OwnedOperationRequest,
    form: EditorFormController<TFormValues>,
  ): void {
    this.releaseOperation(request);
    form.setBusy(false);
    this.dialog.setBusy(false);
    this.transitionTo({ action, status: 'open' });
    this.dialog.focusInvalidField();
  }

  private async submitCreate(): Promise<void> {
    const form = this.activeForm;
    if (
      this.state.status !== 'open' ||
      this.state.action !== 'create' ||
      form === undefined
    ) {
      return;
    }

    const request = this.setSubmitting('create');
    let phase: EditorErrorHookContext['phase'] = 'validation';
    try {
      const validationResult = await form.validate();
      if (!this.ownsOperation(request)) {
        return;
      }
      if (!validationResult.valid) {
        this.restoreOpenAfterValidation('create', request, form);
        return;
      }

      const values = freezeEditorValues<TFormValues>(await form.collect());
      if (!this.ownsOperation(request)) {
        return;
      }

      phase = 'submit';
      if (this.options.hooks?.beforeSubmit !== undefined) {
        const shouldContinue = await Promise.resolve(
          this.options.hooks.beforeSubmit(
            values,
            this.operationOwner.context(this.table, request),
          ),
        );
        if (!this.ownsOperation(request)) {
          return;
        }
        if (shouldContinue === false) {
          this.restoreOpenAfterValidation('create', request, form);
          return;
        }
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.tableElement,
        'alteditor-lite:submit',
        {
          editor: this,
          mode: 'dialog',
          operation: 'create',
          type: 'submit',
          values,
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      phase = 'persistence';
      const row = await this.createRow(values, request);
      if (!this.ownsOperation(request)) {
        return;
      }

      this.table.rows.add([row]).draw(false);
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.tableElement,
        'alteditor-lite:success',
        {
          editor: this,
          mode: 'dialog',
          operation: 'create',
          row,
          type: 'success',
          values,
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      this.completeSuccessfulFormOperation('create', request, form);
      await this.runAfterSuccessHook({
        mode: 'dialog',
        operation: 'create',
        row,
        table: this.table,
        values,
      });
    } catch (error: unknown) {
      this.handleDialogOperationFailure('create', request, error, form, phase);
    }
  }

  private async createRow(
    values: Readonly<EditorValues<TFormValues>>,
    request: OwnedOperationRequest,
  ): Promise<TRow> {
    if (this.options.operations?.create !== undefined) {
      const rowCandidate: unknown = await this.options.operations.create(
        values,
        this.operationContext(request),
      );
      assertCompleteRow(rowCandidate, 'operations.create');
      return rowCandidate as TRow;
    }

    if (this.options.clientSide?.createRow === undefined) {
      throw new EditorConfigurationError(
        'Create requires operations.create or clientSide.createRow.',
      );
    }

    const rowCandidate: unknown = this.options.clientSide.createRow(values);
    if (isPromiseLike(rowCandidate)) {
      throw new EditorConfigurationError(
        'clientSide.createRow must return synchronously.',
      );
    }

    assertCompleteRow(rowCandidate, 'clientSide.createRow');
    return rowCandidate as TRow;
  }

  private async submitEdit(): Promise<void> {
    const form = this.activeForm;
    const capture = this.editTargetCapture;
    if (
      this.state.status !== 'open' ||
      this.state.action !== 'edit' ||
      form === undefined ||
      capture === undefined
    ) {
      return;
    }

    const target = this.createDialogEditTarget(capture);
    await this.editOperationRunner.run({
      ...(this.options.hooks?.afterSuccess === undefined
        ? {}
        : {
            afterSuccess: async (context) => {
              await Promise.resolve(this.options.hooks?.afterSuccess?.(context));
            },
          }),
      ...(this.options.hooks?.beforeSubmit === undefined
        ? {}
        : {
            beforeSubmit: async (transaction, context) => {
              const shouldContinue = await Promise.resolve(
                this.options.hooks?.beforeSubmit?.(transaction.values, {
                  ...context,
                  original: transaction.original,
                }),
              );
              return shouldContinue !== false;
            },
          }),
      commit: async (row, rowIndex, request) => {
        const result = await commitRowUpdate(
          this.table,
          rowIndex,
          row,
          this.drawOwnership,
          request.abortController.signal,
          'dialog-edit-success',
        );
        if (!(this.options.closeOnSuccess ?? true)) {
          this.editTargetCapture = captureEditTarget(
            this.table,
            rowIndex,
            this.language.errors.targetUnavailable,
          );
        }
        return result;
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          this.tableElement,
          'alteditor-lite:submit',
          {
            editor: this,
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
          this.tableElement,
          'alteditor-lite:success',
          {
            editor: this,
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
          this.completeSuccessfulEditPresentation(form);
          return Promise.resolve();
        },
        restoreAfterOperationFailure: () => undefined,
        restoreAfterValidationFailure: () => {
          form.setBusy(false);
          this.dialog.setBusy(false);
          this.dialog.setSubmitAvailable(true);
          this.transitionTo({ action: 'edit', status: 'open' });
          this.dialog.focusInvalidField();
        },
        setBusy: (isBusy) => {
          form.setBusy(isBusy);
          this.dialog.setBusy(isBusy);
        },
        showOperationError: (error) => {
          form.showSubmissionError(error);
          this.dialog.showError(error.message);
          this.dialog.setSubmitAvailable(error.retryable);
          this.transitionTo({
            action: 'edit',
            status: 'open',
            submissionError: error,
          });
        },
        startValidation: () => {
          this.setDialogSubmitting('edit');
        },
        validate: async (signal) => {
          const validationResult = await form.validate();
          signal.throwIfAborted();
          if (!validationResult.valid) {
            return {
              error: new AltEditorLiteError({
                code: 'VALIDATION',
                fieldErrors: validationResult.fieldErrors,
                message: this.language.validation.invalid,
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
        this.reportOperationError(error, context, publishEvent);
      },
      revalidateTarget: () =>
        resolveEditTarget(
          this.table,
          this.tableElement,
          capture,
          this.language.errors.targetUnavailable,
        ),
      target,
    });
  }

  private async submitRemove(): Promise<void> {
    const capture = this.removeTargetCapture;
    if (
      this.state.status !== 'open' ||
      this.state.action !== 'remove' ||
      capture === undefined
    ) {
      return;
    }

    const request = this.setSubmitting('remove');
    let phase: EditorErrorHookContext['phase'] = 'submit';
    try {
      // Confirm ownership immediately before exposing captured rows to listeners.
      resolveRemoveTargets(
        this.table,
        this.tableElement,
        capture,
        this.language.errors.targetUnavailable,
      );
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.tableElement,
        'alteditor-lite:submit',
        {
          editor: this,
          mode: 'dialog',
          operation: 'remove',
          rows: capture.snapshot.originals,
          type: 'submit',
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      // A submit listener can redraw or replace rows, so validate again afterward.
      resolveRemoveTargets(
        this.table,
        this.tableElement,
        capture,
        this.language.errors.targetUnavailable,
      );
      phase = 'persistence';
      if (this.options.operations?.remove !== undefined) {
        await this.options.operations.remove(
          capture.snapshot.originals,
          this.operationContext(request),
        );
      }
      if (!this.ownsOperation(request)) {
        return;
      }

      // Persistence can be asynchronous; resolve only now to avoid removing new rows.
      const rowIndexes = resolveRemoveTargets(
        this.table,
        this.tableElement,
        capture,
        this.language.errors.targetUnavailable,
      );
      this.table
        .rows(rowIndexes as RowSelector<TRow>)
        .remove()
        .draw(false);
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.tableElement,
        'alteditor-lite:success',
        {
          editor: this,
          mode: 'dialog',
          operation: 'remove',
          rows: capture.snapshot.originals,
          type: 'success',
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      this.releaseOperation(request);
      this.closeAfterSuccess('remove');
      await this.runAfterSuccessHook({
        mode: 'dialog',
        operation: 'remove',
        rows: capture.snapshot.originals,
        table: this.table,
      });
    } catch (error: unknown) {
      this.handleDialogOperationFailure('remove', request, error, undefined, phase);
    }
  }

  private handleDialogOperationFailure(
    action: DialogAction,
    request: OwnedOperationRequest,
    rawError: unknown,
    form?: EditorFormController<TFormValues>,
    phase: EditorErrorHookContext['phase'] = 'persistence',
  ): void {
    if (!this.ownsOperation(request)) {
      return;
    }

    const operationError = normalizeOperationError(
      rawError,
      request.abortController.signal,
      this.language,
    );
    this.releaseOperation(request);
    form?.setBusy(false);
    this.dialog.setBusy(false);

    if (operationError instanceof InternalOperationAbort) {
      this.dialog.setSubmitAvailable(true);
      this.transitionTo({ action, status: 'open' });
      return;
    }

    form?.showSubmissionError(operationError);
    this.dialog.showError(operationError.message);
    this.dialog.setSubmitAvailable(operationError.retryable);
    this.transitionTo({
      action,
      status: 'open',
      submissionError: operationError,
    });
    this.reportOperationError(
      operationError,
      {
        committed: false,
        mode: 'dialog',
        operation: action,
        phase,
      },
      true,
    );
  }

  private completeSuccessfulFormOperation(
    action: Extract<DialogAction, 'create' | 'edit'>,
    request: OwnedOperationRequest,
    form: EditorFormController<TFormValues>,
  ): void {
    this.releaseOperation(request);
    if (this.options.closeOnSuccess ?? true) {
      this.closeAfterSuccess(action);
      return;
    }

    form.setBusy(false);
    this.dialog.setBusy(false);
    this.dialog.setSubmitAvailable(true);
    this.transitionTo({ action, status: 'open' });
  }

  private completeSuccessfulEditPresentation(
    form: EditorFormController<TFormValues>,
  ): void {
    if (this.options.closeOnSuccess ?? true) {
      this.closeAfterSuccess('edit');
      return;
    }

    form.setBusy(false);
    this.dialog.setBusy(false);
    this.dialog.setSubmitAvailable(true);
    this.transitionTo({ action: 'edit', status: 'open' });
  }

  private createDialogEditTarget(
    capture: EditTargetCapture<TRow>,
  ): Readonly<EditorOperationTarget> {
    return Object.freeze({
      fieldNames: Object.freeze(
        this.options.fields
          .filter((field) => field.editable !== false && field.disabled !== true)
          .map((field) => field.name),
      ),
      rowIndex: capture.snapshot.rowIndex,
      ...(capture.snapshot.rowId === undefined ? {} : { rowId: capture.snapshot.rowId }),
    });
  }

  private reportOperationError(
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ): void {
    try {
      this.options.hooks?.onError?.(error, context);
    } catch (hookError: unknown) {
      console.warn('AltEditorLite onError callback failed.', hookError);
    }

    if (!publishEvent || this.state.status === 'destroyed') {
      return;
    }
    const inlineTarget =
      context.mode === 'inline' &&
      context.target?.columnIndex !== undefined &&
      context.target.fieldNames[0] !== undefined
        ? {
            columnIndex: context.target.columnIndex,
            fieldName: context.target.fieldNames[0],
            rowIndex: context.target.rowIndex,
            ...(context.target.rowId === undefined
              ? {}
              : { rowId: context.target.rowId }),
            ...(context.target.columnName === undefined
              ? {}
              : { columnName: context.target.columnName }),
          }
        : undefined;
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
      this.tableElement,
      'alteditor-lite:error',
      {
        editor: this,
        error,
        mode: context.mode,
        operation: context.operation,
        ...(inlineTarget === undefined ? {} : { target: inlineTarget }),
        type: 'error',
      },
    );
  }

  private async runAfterSuccessHook(
    context: AfterSuccessContext<TRow, TFormValues>,
  ): Promise<void> {
    const hook = this.options.hooks?.afterSuccess;
    if (hook === undefined || this.state.status === 'destroyed') {
      return;
    }
    try {
      await Promise.resolve(hook(context));
    } catch (rawError: unknown) {
      const error = normalizeOperationError(
        rawError,
        new AbortController().signal,
        this.language,
      );
      if (!(error instanceof InternalOperationAbort)) {
        this.reportOperationError(
          error,
          {
            committed: true,
            mode: context.mode,
            operation: context.operation,
            phase: 'afterSuccess',
            ...(context.target === undefined ? {} : { target: context.target }),
          },
          false,
        );
      }
    }
  }

  private async runRefresh(): Promise<void> {
    this.transitionTo({ status: 'refreshing' });
    const request = this.beginOperation('refresh');
    let didSucceed = false;
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      this.tableElement,
      'alteditor-lite:refresh',
      {
        editor: this,
        mode: 'api',
        operation: 'refresh',
        phase: 'start',
        type: 'refresh',
      },
    );
    if (!this.ownsOperation(request)) {
      return;
    }

    try {
      if (this.options.operations?.refresh === undefined) {
        await refreshDataTable(this.table, request.abortController.signal);
      } else {
        await this.options.operations.refresh(this.operationContext(request));
      }
      if (!this.ownsOperation(request)) {
        return;
      }
      didSucceed = true;

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.tableElement,
        'alteditor-lite:success',
        {
          editor: this,
          mode: 'api',
          operation: 'refresh',
          type: 'success',
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }
    } catch (rawError: unknown) {
      if (!this.ownsOperation(request)) {
        return;
      }

      const operationError = normalizeOperationError(
        rawError,
        request.abortController.signal,
        this.language,
      );
      if (operationError instanceof InternalOperationAbort) {
        this.releaseOperation(request);
        this.releaseRefreshInteraction();
        this.transitionTo({ status: 'ready' });
        return;
      }

      this.reportOperationError(
        operationError,
        {
          committed: false,
          mode: 'api',
          operation: 'refresh',
          phase: 'persistence',
        },
        true,
      );
      if (!this.ownsOperation(request)) {
        return;
      }
    }

    this.releaseOperation(request);
    this.releaseRefreshInteraction();
    this.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      this.tableElement,
      'alteditor-lite:refresh',
      {
        editor: this,
        mode: 'api',
        operation: 'refresh',
        phase: 'complete',
        type: 'refresh',
      },
    );
    if (didSucceed) {
      await this.runAfterSuccessHook({
        mode: 'api',
        operation: 'refresh',
        table: this.table,
      });
    }
  }

  private closeAfterSuccess(action: DialogAction): void {
    if (this.state.status !== 'submitting' || this.state.action !== action) {
      throw new EditorOperationBusyError();
    }

    this.transitionTo({ action, status: 'closing' });
    this.finishClose(action, 'success');
  }

  private closeDialogNow(reason: Exclude<EditorCloseReason, 'success'>): void {
    this.assertActive();
    if (this.state.status === 'ready') {
      if (this.dialogInteractionToken !== undefined) {
        this.activeOpenAbortController?.abort();
        this.releaseDialogInteraction();
      }
      return;
    }
    if (this.state.status !== 'open' && this.state.status !== 'submitting') {
      throw new EditorOperationBusyError();
    }

    const action = this.state.action;
    if (this.state.status === 'submitting') {
      this.abortActiveOperation();
    }
    this.transitionTo({ action, status: 'closing' });
    this.finishClose(action, reason);
  }

  private finishClose(action: DialogAction, reason: EditorCloseReason): void {
    this.dialog.close();
    this.activeForm?.destroy();
    this.activeForm = undefined;
    this.editTargetCapture = undefined;
    this.removeTargetCapture = undefined;
    this.releaseDialogInteraction();
    this.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
      this.tableElement,
      'alteditor-lite:close',
      {
        editor: this,
        mode: 'dialog',
        operation: action,
        reason,
        type: 'close',
      },
    );
  }

  private getIntegrationButtonState(): EditorButtonState {
    const isReady =
      this.state.status === 'ready' && this.interactionCoordinator.current() === 'none';
    const hasSelect = this.selectIntegration.available();
    const selectedRowCount = hasSelect
      ? this.selectIntegration.selectedRowIndexes().length
      : 0;
    const hasCreate = this.hasCreateCapability();

    return createEditorButtonState({
      hasCreate,
      hasSelect,
      isReady,
      language: this.language,
      selectedRowCount,
    });
  }

  private validateLocalUniqueness(
    action: Extract<DialogAction, 'create' | 'edit'>,
    values: Readonly<EditorValues<TFormValues>>,
  ): Readonly<Record<string, string>> {
    const excludedRow = action === 'edit' ? this.editTargetCapture?.sourceRow : undefined;
    return this.validateLocalUniquenessForRow(values, excludedRow);
  }

  private validateLocalUniquenessForRow(
    values: Readonly<EditorValues<TFormValues>>,
    excludedRow: TRow | undefined,
  ): Readonly<Record<string, string>> {
    const fieldErrors: Record<string, string> = {};

    const candidates = this.uniqueFieldLookups.flatMap((field) => {
      const value = lookupPathSegments(values, field.pathSegments).value;
      return value === undefined ? [] : [{ ...field, value }];
    });

    this.table
      .rows()
      .data()
      .each((row) => {
        if (row === excludedRow) {
          return;
        }

        for (const candidate of candidates) {
          if (
            fieldErrors[candidate.name] === undefined &&
            Object.is(
              lookupPathSegments(row, candidate.pathSegments).value,
              candidate.value,
            )
          ) {
            fieldErrors[candidate.name] = this.language.validation.unique;
          }
        }
      });

    return fieldErrors;
  }

  private transitionTo(nextState: EditorState): void {
    assertEditorStateTransition(this.state, nextState);
    this.state = nextState;
    dispatchEditorIntegrationUpdate(this.tableElement);
  }
}
