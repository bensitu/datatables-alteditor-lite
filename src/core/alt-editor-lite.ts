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
import { createInstanceId } from '../instance/create-instance-id.js';
import {
  deleteEditorInstance,
  storeEditorInstance,
} from '../instance/editor-instance-store.js';
import { getPathValue } from '../object-path/get-path-value.js';

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
import { dispatchEditorEvent, type EditorCloseReason } from './editor-event.js';
import { assertEditorStateTransition } from './editor-state-transition.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from './error-normalization.js';
import { mergeDeclaredFieldValues } from './merge-declared-field-values.js';
import { RequestSequence } from './request-sequence.js';
import { validateOperationConfiguration } from './validate-operation-configuration.js';

import type {
  AltEditorLiteOptions,
  OperationContext,
} from './alt-editor-lite-options.js';
import type { DialogAction, EditorOperation } from './editor-operation.js';
import type { EditorState } from './editor-state.js';
import type { DeepPartial, EditorValues } from './editor-values.js';
import type { FieldController } from '../fields/field-controller.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api, RowSelector } from 'datatables.net';

interface OwnedOperationRequest {
  readonly abortController: AbortController;
  readonly operation: EditorOperation;
  readonly sequence: number;
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
  private readonly declaredFieldPaths: readonly string[];

  private readonly dialog: EditorDialog;

  private readonly instanceId = createInstanceId();

  private readonly language: Readonly<AltEditorLiteLanguage>;

  private readonly requestSequence = new RequestSequence();

  private readonly selectIntegration: SelectIntegration<TRow>;

  private readonly tableElement: HTMLTableElement;

  private activeForm: EditorFormController<TFormValues> | undefined;

  private activeOperationRequest: OwnedOperationRequest | undefined;

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
    this.declaredFieldPaths = Object.freeze(options.fields.map((field) => field.name));
    this.language = resolveLanguage(options.language);
    this.tableElement = table.table().node();
    storeEditorInstance(this.tableElement, this);

    try {
      this.dialog = new EditorDialog(this.tableElement, this.instanceId, this.language);
      this.selectIntegration = new SelectIntegration(this.table, () => {
        dispatchEditorIntegrationUpdate(this.tableElement);
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
  public openCreateDialog(): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      if (!this.hasCreateCapability()) {
        throw new EditorConfigurationError(
          'Create requires operations.create or clientSide.createRow.',
        );
      }

      this.openFormDialog('create');
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Opens an Edit dialog for one explicit or currently selected row.
   *
   * @param rowSelector - Public DataTables selector. When omitted, Select must
   * resolve exactly one row.
   * @returns A promise resolved after the snapshot is populated and focused.
   */
  public openEditDialog(rowSelector?: RowSelector<TRow>): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
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
      try {
        this.openFormDialog('edit', this.editTargetCapture.snapshot.original);
      } catch (error: unknown) {
        this.editTargetCapture = undefined;
        throw error;
      }

      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Opens mandatory Remove confirmation for explicit or selected rows.
   *
   * @param rowSelectors - Public DataTables selector. When omitted, Select must
   * resolve one or more rows.
   * @returns A promise resolved after confirmation is open and focused.
   */
  public openRemoveDialog(rowSelectors?: RowSelector<TRow>): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
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
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Refreshes the table without opening a dialog.
   *
   * Ajax-backed tables use `ajax.reload`; other tables use `draw(false)`.
   * Refresh is mutually exclusive with every dialog lifecycle.
   *
   * @returns A promise settled after the current public refresh completes.
   */
  public refreshTable(): Promise<void> {
    try {
      this.assertActive();
      this.assertReady();
      return this.runRefresh();
    } catch (error: unknown) {
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

  /**
   * Aborts owned work, removes DOM and listeners, releases the table, and emits
   * destroy once.
   */
  public destroy(): void {
    if (this.state.status === 'destroyed') {
      return;
    }

    this.abortActiveOperation();
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
    if (this.state.status !== 'ready') {
      throw new EditorOperationBusyError();
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
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
        this.tableElement,
        'alteditor-lite:error',
        {
          editor: this,
          error: openingError,
          operation: action,
          type: 'error',
        },
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
    const request: OwnedOperationRequest = {
      abortController: new AbortController(),
      operation,
      sequence: this.requestSequence.next(),
    };
    this.activeOperationRequest = request;
    return request;
  }

  private ownsOperation(request: OwnedOperationRequest): boolean {
    return (
      this.state.status !== 'destroyed' &&
      this.activeOperationRequest === request &&
      this.requestSequence.isCurrent(request.sequence) &&
      !request.abortController.signal.aborted
    );
  }

  private releaseOperation(request: OwnedOperationRequest): void {
    if (this.activeOperationRequest === request) {
      this.activeOperationRequest = undefined;
    }
  }

  private abortActiveOperation(): void {
    this.activeOperationRequest?.abortController.abort();
    this.activeOperationRequest = undefined;
    this.requestSequence.invalidate();
  }

  private operationContext(request: OwnedOperationRequest): OperationContext<TRow> {
    return Object.freeze({
      operation: request.operation,
      signal: request.abortController.signal,
      table: this.table,
    });
  }

  private setSubmitting(action: DialogAction): OwnedOperationRequest {
    this.transitionTo({ action, status: 'submitting' });
    this.activeForm?.setBusy(true);
    this.dialog.setSubmitAvailable(true);
    this.dialog.setBusy(true);
    this.activeForm?.clearErrors();
    this.dialog.clearError();
    return this.beginOperation(action);
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
    try {
      const validationResult = await form.validate();
      if (!this.ownsOperation(request)) {
        return;
      }
      if (!validationResult.valid) {
        this.restoreOpenAfterValidation('create', request, form);
        return;
      }

      const values = await form.collect();
      if (!this.ownsOperation(request)) {
        return;
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.tableElement,
        'alteditor-lite:submit',
        {
          editor: this,
          operation: 'create',
          type: 'submit',
          values,
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

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
    } catch (error: unknown) {
      this.handleDialogOperationFailure('create', request, error, form);
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

    const request = this.setSubmitting('edit');
    try {
      const validationResult = await form.validate();
      if (!this.ownsOperation(request)) {
        return;
      }
      if (!validationResult.valid) {
        this.restoreOpenAfterValidation('edit', request, form);
        return;
      }

      const collectedForm = await form.collectWithMetadata();
      const values = collectedForm.values;
      if (!this.ownsOperation(request)) {
        return;
      }

      // Confirm ownership immediately before exposing the captured row to listeners.
      resolveEditTarget(
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
          operation: 'edit',
          original: capture.snapshot.original,
          type: 'submit',
          values,
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      // A submit listener can redraw or replace rows, so validate again afterward.
      resolveEditTarget(
        this.table,
        this.tableElement,
        capture,
        this.language.errors.targetUnavailable,
      );
      const row = await this.updateRow(
        values,
        capture,
        request,
        collectedForm.fieldValues,
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      // Persistence can be asynchronous; resolve only now to avoid updating a new row.
      const rowIndex = resolveEditTarget(
        this.table,
        this.tableElement,
        capture,
        this.language.errors.targetUnavailable,
      );
      this.table.row(rowIndex).data(row).draw(false);
      if (!(this.options.closeOnSuccess ?? true)) {
        this.editTargetCapture = captureEditTarget(
          this.table,
          rowIndex,
          this.language.errors.targetUnavailable,
        );
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.tableElement,
        'alteditor-lite:success',
        {
          editor: this,
          operation: 'edit',
          original: capture.snapshot.original,
          row,
          type: 'success',
          values,
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }

      this.completeSuccessfulFormOperation('edit', request, form);
    } catch (error: unknown) {
      this.handleDialogOperationFailure('edit', request, error, form);
    }
  }

  private async updateRow(
    values: Readonly<EditorValues<TFormValues>>,
    capture: EditTargetCapture<TRow>,
    request: OwnedOperationRequest,
    collectedFieldValues: ReadonlyMap<string, unknown>,
  ): Promise<TRow> {
    if (this.options.operations?.update !== undefined) {
      const rowCandidate: unknown = await this.options.operations.update(
        values,
        capture.snapshot.original,
        this.operationContext(request),
      );
      assertCompleteRow(rowCandidate, 'operations.update');
      return rowCandidate as TRow;
    }

    if (this.options.clientSide?.updateRow !== undefined) {
      const rowCandidate: unknown = this.options.clientSide.updateRow(
        capture.snapshot.original,
        values,
      );
      if (isPromiseLike(rowCandidate)) {
        throw new EditorConfigurationError(
          'clientSide.updateRow must return synchronously.',
        );
      }

      assertCompleteRow(rowCandidate, 'clientSide.updateRow');
      return rowCandidate as TRow;
    }

    return mergeDeclaredFieldValues(
      capture.snapshot.original,
      values,
      this.declaredFieldPaths,
      collectedFieldValues,
    );
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
    } catch (error: unknown) {
      this.handleDialogOperationFailure('remove', request, error);
    }
  }

  private handleDialogOperationFailure(
    action: DialogAction,
    request: OwnedOperationRequest,
    rawError: unknown,
    form?: EditorFormController<TFormValues>,
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
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
      this.tableElement,
      'alteditor-lite:error',
      {
        editor: this,
        error: operationError,
        operation: action,
        type: 'error',
      },
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

  private async runRefresh(): Promise<void> {
    this.transitionTo({ status: 'refreshing' });
    const request = this.beginOperation('refresh');
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      this.tableElement,
      'alteditor-lite:refresh',
      {
        editor: this,
        operation: 'refresh',
        phase: 'start',
        type: 'refresh',
      },
    );
    if (!this.ownsOperation(request)) {
      return;
    }

    try {
      await refreshDataTable(this.table, request.abortController.signal);
      if (!this.ownsOperation(request)) {
        return;
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.tableElement,
        'alteditor-lite:success',
        {
          editor: this,
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
        this.transitionTo({ status: 'ready' });
        return;
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
        this.tableElement,
        'alteditor-lite:error',
        {
          editor: this,
          error: operationError,
          operation: 'refresh',
          type: 'error',
        },
      );
      if (!this.ownsOperation(request)) {
        return;
      }
    }

    this.releaseOperation(request);
    this.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      this.tableElement,
      'alteditor-lite:refresh',
      {
        editor: this,
        operation: 'refresh',
        phase: 'complete',
        type: 'refresh',
      },
    );
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
    this.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
      this.tableElement,
      'alteditor-lite:close',
      {
        editor: this,
        operation: action,
        reason,
        type: 'close',
      },
    );
  }

  private getIntegrationButtonState(): EditorButtonState {
    const isReady = this.state.status === 'ready';
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
    const rows = this.table.rows().data().toArray();
    const excludedRow = action === 'edit' ? this.editTargetCapture?.sourceRow : undefined;
    const fieldErrors: Record<string, string> = {};

    for (const field of this.options.fields) {
      if (field.unique !== true) {
        continue;
      }

      const candidateValue = getPathValue(values, field.name);
      if (candidateValue === undefined) {
        continue;
      }

      const hasDuplicate = rows.some(
        (row) =>
          row !== excludedRow && Object.is(getPathValue(row, field.name), candidateValue),
      );
      if (hasDuplicate) {
        fieldErrors[field.name] = this.language.validation.unique;
      }
    }

    return fieldErrors;
  }

  private transitionTo(nextState: EditorState): void {
    assertEditorStateTransition(this.state, nextState);
    this.state = nextState;
    dispatchEditorIntegrationUpdate(this.tableElement);
  }
}
