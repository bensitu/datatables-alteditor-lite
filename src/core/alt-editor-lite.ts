import { DataTablesHost } from '../datatables/data-tables-host.js';
import { DialogEditingController } from '../dialog/dialog-editing-controller.js';
import { validateFieldConfigurations } from '../fields/validate-field-configurations.js';
import { validateFormDependencies } from '../form/validate-form-dependencies.js';
import { InlineColumnMappingRegistry } from '../inline/inline-column-mapping-registry.js';
import { InlineEditController } from '../inline/inline-edit-controller.js';
import { createInlineEditPresentation } from '../inline/inline-edit-presentation.js';
import { validateInlineConfiguration } from '../inline/validate-inline-configuration.js';
import { createInstanceId } from '../instance/create-instance-id.js';
import {
  deleteEditorInstance,
  storeEditorInstance,
} from '../instance/editor-instance-store.js';

import { EditorConfigurationError } from './alt-editor-lite-error.js';
import {
  resolveLanguage,
  type AltEditorLiteLanguage,
} from './alt-editor-lite-language.js';
import { EditOperationRunner } from './editing/edit-operation-runner.js';
import { InteractionCoordinator } from './editing/interaction-coordinator.js';
import { OperationOwner } from './editing/operation-owner.js';
import { resolveEditorCapabilities } from './editor-capabilities.js';
import { EditorErrorReporter } from './editor-error-reporter.js';
import { dispatchEditorEvent } from './editor-event.js';
import { EditorStateCoordinator } from './editor-state-coordinator.js';
import { LocalUniquenessValidator } from './local-uniqueness-validator.js';
import { RefreshOperationRunner } from './refresh-operation-runner.js';
import { resolveEditingOptions } from './resolve-editing-options.js';
import { validateHooksConfiguration } from './validate-hooks-configuration.js';
import { validateOperationConfiguration } from './validate-operation-configuration.js';

import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';
import type { EditorCapabilities } from './editor-capabilities.js';
import type { EditorState } from './editor-state.js';
import type { DeepPartial } from './editor-values.js';
import type { ResolvedEditingOptions } from './resolve-editing-options.js';
import type { FieldController } from '../fields/field-controller.js';
import type { InlineEditState } from '../inline/inline-edit-state.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

function normalizeRejectedReason(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('AltEditorLite failed with a non-Error value.', {
        cause: error,
      });
}

/** Lightweight native CRUD editor bound to one DataTables API instance. */
export class AltEditorLite<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> {
  private readonly capabilities: Readonly<EditorCapabilities>;

  private readonly editing: Readonly<ResolvedEditingOptions<TFormValues>>;

  private readonly instanceId = createInstanceId();

  private readonly language: Readonly<AltEditorLiteLanguage>;

  private readonly interactionCoordinator = new InteractionCoordinator();

  private readonly operationOwner = new OperationOwner();

  private readonly host: DataTablesHost<TRow>;

  private readonly stateCoordinator: EditorStateCoordinator;

  private readonly inlineController: InlineEditController<TRow, TFormValues>;

  private readonly dialogController: DialogEditingController<TRow, TFormValues>;

  private readonly refreshOperationRunner: RefreshOperationRunner<TRow, TFormValues>;

  private readonly tableElement: HTMLTableElement;

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
    const editing = resolveEditingOptions(options.editing);
    validateFieldConfigurations(options.fields);
    validateFormDependencies(options.fields, options.dependencies);
    validateOperationConfiguration(options);
    validateHooksConfiguration(options);
    validateInlineConfiguration(table, options, editing);

    this.editing = editing;
    this.capabilities = resolveEditorCapabilities(editing, {
      create:
        options.operations?.create !== undefined ||
        options.clientSide?.createRow !== undefined,
    });
    this.language = resolveLanguage(options.language);
    this.host = new DataTablesHost(table);
    this.tableElement = this.host.eventTarget;
    this.stateCoordinator = new EditorStateCoordinator(() => {
      this.host.notifyIntegration();
    });
    const editOperationRunner = new EditOperationRunner(
      table,
      this.operationOwner,
      this.language,
      options.operations,
      options.clientSide,
    );
    const uniquenessValidator = new LocalUniquenessValidator(
      this.host,
      options.fields,
      this.language,
    );

    storeEditorInstance(this.host.ownershipKey, this);
    let inlineController: InlineEditController<TRow, TFormValues> | undefined;
    let dialogController: DialogEditingController<TRow, TFormValues> | undefined;
    let refreshOperationRunner: RefreshOperationRunner<TRow, TFormValues> | undefined;
    try {
      const errorReporter = new EditorErrorReporter(
        this,
        this.tableElement,
        this.language,
        options.hooks,
        () => this.stateCoordinator.getState().status === 'destroyed',
      );
      const inlineMappingRegistry = new InlineColumnMappingRegistry(
        table,
        options.fields,
        editing.inline,
      );
      const inlinePresentation = createInlineEditPresentation<TRow, TFormValues>(
        editing.inline.activation,
        editing.inline,
        this.language,
      );
      inlineController = new InlineEditController({
        host: this.host,
        enabled: this.capabilities.inlineEdit,
        editOperationRunner,
        editor: this,
        editorOptions: options,
        fields: options.fields,
        instanceId: this.instanceId,
        interactionCoordinator: this.interactionCoordinator,
        language: this.language,
        mappingRegistry: inlineMappingRegistry,
        notifyIntegration: () => {
          this.host.notifyIntegration();
        },
        operationOwner: this.operationOwner,
        options: editing.inline,
        presentation: inlinePresentation,
        reportError: (error, context, publishEvent) => {
          errorReporter.report(error, context, publishEvent);
        },
        table,
        tableElement: this.tableElement,
        validateUnique: (values, excludedRow) =>
          uniquenessValidator.validate(values, excludedRow),
      });
      dialogController = new DialogEditingController({
        capabilities: this.capabilities,
        editing: editing.dialog,
        editor: this,
        editOperationRunner,
        errorReporter,
        inlineController,
        instanceId: this.instanceId,
        interactionCoordinator: this.interactionCoordinator,
        language: this.language,
        operationOwner: this.operationOwner,
        options,
        stateCoordinator: this.stateCoordinator,
        host: this.host,
        table,
        tableElement: this.tableElement,
        uniquenessValidator,
      });
      refreshOperationRunner = new RefreshOperationRunner({
        editor: this,
        errorReporter,
        host: this.host,
        interactionCoordinator: this.interactionCoordinator,
        language: this.language,
        operationOwner: this.operationOwner,
        options,
        notifyIntegration: () => {
          this.host.notifyIntegration();
        },
        prepareForExternalOperation: async () => {
          await inlineController?.prepareForExternalOperation();
        },
        stateCoordinator: this.stateCoordinator,
        table,
        tableElement: this.tableElement,
      });
    } catch (error: unknown) {
      refreshOperationRunner?.destroy();
      dialogController?.destroy();
      inlineController?.destroy();
      this.operationOwner.destroy();
      this.host.destroy();
      this.interactionCoordinator.destroy();
      deleteEditorInstance(this.host.ownershipKey, this);
      throw error;
    }

    this.inlineController = inlineController;
    this.dialogController = dialogController;
    this.refreshOperationRunner = refreshOperationRunner;
    this.host.notifyIntegration();
  }

  /** Opens the Create dialog. */
  public openCreateDialog(): Promise<void> {
    return this.dialogController.openCreate();
  }

  /** Opens Dialog Edit for one explicit or selected row. */
  public openEditDialog(rowSelector?: RowSelector<TRow>): Promise<void> {
    return this.dialogController.openEdit(rowSelector);
  }

  /** Opens Remove confirmation for explicit or selected rows. */
  public openRemoveDialog(rowSelector?: RowSelector<TRow>): Promise<void> {
    return this.dialogController.openRemove(rowSelector);
  }

  /** Runs the configured refresh operation or DataTables fallback. */
  public refreshTable(): Promise<void> {
    return this.refreshOperationRunner.run();
  }

  /** Closes an active operation dialog. */
  public closeDialog(): Promise<void> {
    return this.dialogController.close();
  }

  /** Retrieves a rendered dialog field controller by safe path. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    return this.dialogController.getField(name);
  }

  /** Returns the current readonly lifecycle state. */
  public getState(): Readonly<EditorState> {
    this.stateCoordinator.assertActive();
    return this.stateCoordinator.getState();
  }

  /** Opens one eligible cell through unique public DataTables selectors. */
  public async openInlineEdit(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void> {
    try {
      this.assertInlineEditAvailable();
      await this.inlineController.open(rowSelector, columnSelector);
    } catch (error: unknown) {
      throw normalizeRejectedReason(error);
    }
  }

  /** Validates and submits the active inline candidate. */
  public submitInlineEdit(): Promise<void> {
    try {
      this.assertInlineEditAvailable();
      return this.inlineController.submit();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Cancels the active inline session and safely restores cell content. */
  public cancelInlineEdit(): Promise<void> {
    try {
      this.assertInlineEditAvailable();
      return this.inlineController.cancel();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Returns the independent inline presentation state. */
  public getInlineState(): Readonly<InlineEditState> {
    this.assertInlineEditAvailable();
    return this.inlineController.getState();
  }

  /** Returns whether inline activation, validation, or submission is active. */
  public isInlineEditing(): boolean {
    this.assertInlineEditAvailable();
    return this.inlineController.isEditing();
  }

  /** Aborts owned work, removes DOM and listeners, and releases the table. */
  public destroy(): void {
    if (this.stateCoordinator.getState().status === 'destroyed') {
      return;
    }

    this.dialogController.destroy();
    this.refreshOperationRunner.destroy();
    this.operationOwner.destroy();
    this.host.destroy();
    this.inlineController.destroy();
    this.interactionCoordinator.destroy();
    this.stateCoordinator.destroy();
    deleteEditorInstance(this.host.ownershipKey, this);
    this.host.notifyIntegration();
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

  private assertInlineEditAvailable(): void {
    this.stateCoordinator.assertActive();
    if (!this.capabilities.inlineEdit) {
      throw new EditorConfigurationError(
        'Inline Edit is disabled by editing.inline.enabled.',
      );
    }
  }

  private getIntegrationButtonState(): ReturnType<
    DataTablesHost<TRow>['createIntegrationButtonState']
  > {
    const interactionOwner = this.interactionCoordinator.current();
    const isReady =
      this.stateCoordinator.getState().status === 'ready' &&
      (interactionOwner === 'none' ||
        (interactionOwner === 'inline' &&
          this.inlineController.allowsExternalOperation()));
    const hasSelect = this.host.selectionAvailable();
    const selectedRowCount = hasSelect
      ? this.host.resolveRequestedRowIndexes(undefined, '').length
      : 0;

    return this.host.createIntegrationButtonState({
      capabilities: this.capabilities,
      hasCreate: this.capabilities.createDialog,
      hasSelect,
      isReady,
      language: this.language,
      selectedRowCount,
    });
  }
}
