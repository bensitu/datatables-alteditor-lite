import { DialogEditingController } from '../dialog/dialog-editing-controller.js';
import { validateFieldConfigurations } from '../fields/validate-field-configurations.js';
import { validateFormDependencies } from '../form/validate-form-dependencies.js';
import {
  hasHostRefreshCapability,
  hasHostPresentationCapability,
  hasHostRowCollectionCapability,
  hasHostSelectionCapability,
} from '../host/editor-host.js';
import { hasInlineHostRuntimeFactory } from '../host/inline-host-runtime.js';
import { createInstanceId } from '../instance/create-instance-id.js';
import {
  deleteEditorInstance,
  storeEditorInstance,
} from '../instance/editor-instance-store.js';

import {
  EditorConfigurationError,
  EditorSelectionUnavailableError,
} from './alt-editor-lite-error.js';
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
import type { FieldController } from '../fields/field-controller.js';
import type {
  EditorHost,
  HostRecordEntry,
  HostRowCollectionCapability,
} from '../host/editor-host.js';
import type { HostInlineState, InlineHostRuntime } from '../host/inline-host-runtime.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';

function normalizeRejectedReason(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('AltEditorLite failed with a non-Error value.', {
        cause: error,
      });
}

function createInactiveInlineRuntime(): InlineHostRuntime {
  const unavailable = (): Promise<void> =>
    Promise.reject(new EditorConfigurationError('Inline Edit is unavailable.'));
  return {
    allowsExternalOperation: () => true,
    cancel: unavailable,
    destroy: () => undefined,
    getState: () => Object.freeze({ status: 'disabled' }),
    isEditing: () => false,
    open: unavailable,
    prepareForExternalOperation: () => Promise.resolve(),
    submit: unavailable,
  };
}

/** Lightweight CRUD editor operating through a neutral record host. */
export class AltEditorLite<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
  TTarget = unknown,
> {
  private readonly capabilities: Readonly<EditorCapabilities>;

  private readonly instanceId = createInstanceId();

  private readonly language: Readonly<AltEditorLiteLanguage>;

  private readonly interactionCoordinator = new InteractionCoordinator();

  private readonly operationOwner = new OperationOwner();

  private readonly stateCoordinator: EditorStateCoordinator;

  private readonly inlineController: InlineHostRuntime;

  private readonly dialogController: DialogEditingController<TRow, TFormValues, TTarget>;

  private readonly refreshOperationRunner:
    RefreshOperationRunner<TRow, TFormValues> | undefined;

  /** Creates the sole active editor for one Host ownership identity. */
  public constructor(
    private readonly host: EditorHost<TRow, TTarget>,
    options: AltEditorLiteOptions<TRow, TFormValues>,
  ) {
    const editing = resolveEditingOptions(options.editing);
    validateFieldConfigurations(options.fields);
    validateFormDependencies(options.fields, options.dependencies);
    validateOperationConfiguration(options);
    validateHooksConfiguration(options);

    this.capabilities = resolveEditorCapabilities(editing, {
      create:
        options.operations?.create !== undefined ||
        options.clientSide?.createRow !== undefined,
    });
    this.language = resolveLanguage(options.language);
    this.stateCoordinator = new EditorStateCoordinator(() => {
      this.notifyIntegration();
    });

    const hasRecordCollectionRequirement = options.fields.some(
      (field) => field.unique === true,
    );
    if (
      hasRecordCollectionRequirement &&
      !hasHostRowCollectionCapability<TRow, TTarget>(host)
    ) {
      throw new EditorConfigurationError(
        'Local uniqueness validation requires a Host row collection capability.',
      );
    }
    const emptyCollection: HostRowCollectionCapability<TRow, TTarget> = {
      entries: (): Iterable<Readonly<HostRecordEntry<TRow, TTarget>>> => [],
    };
    const uniquenessValidator = new LocalUniquenessValidator(
      hasHostRowCollectionCapability<TRow, TTarget>(host) ? host : emptyCollection,
      options.fields,
      this.language,
    );
    const editOperationRunner = new EditOperationRunner<TRow, TFormValues>(
      this.operationOwner,
      this.language,
      options.operations,
      options.clientSide,
    );

    storeEditorInstance(host.ownershipKey, this);
    let inlineController: InlineHostRuntime | undefined;
    let dialogController: DialogEditingController<TRow, TFormValues, TTarget> | undefined;
    let refreshOperationRunner: RefreshOperationRunner<TRow, TFormValues> | undefined;
    try {
      const errorReporter = new EditorErrorReporter(
        this,
        host.eventTarget,
        this.language,
        options.hooks,
        () => this.stateCoordinator.getState().status === 'destroyed',
      );
      if (hasInlineHostRuntimeFactory<TRow>(host)) {
        inlineController = host.createInlineRuntime({
          editing,
          editor: this,
          editorOptions: options,
          enabled: this.capabilities.inlineEdit,
          editOperationRunner,
          fields: options.fields,
          instanceId: this.instanceId,
          interactionCoordinator: this.interactionCoordinator,
          language: this.language,
          notifyIntegration: () => {
            this.notifyIntegration();
          },
          operationOwner: this.operationOwner,
          reportError: (error, context, publishEvent) => {
            errorReporter.report(error, context, publishEvent);
          },
          validateUnique: (values, excludedRow) =>
            uniquenessValidator.validate(
              values,
              hasHostRowCollectionCapability<TRow, TTarget>(host)
                ? [...host.entries()].find(({ row }) => row === excludedRow)?.target
                : undefined,
            ),
        });
      } else {
        if (this.capabilities.inlineEdit) {
          throw new EditorConfigurationError(
            'Inline Edit is not supported by the configured Host.',
          );
        }
        inlineController = createInactiveInlineRuntime();
      }

      dialogController = new DialogEditingController({
        capabilities: this.capabilities,
        editing: editing.dialog,
        editor: this,
        editOperationRunner,
        errorReporter,
        host,
        inlineController,
        instanceId: this.instanceId,
        interactionCoordinator: this.interactionCoordinator,
        language: this.language,
        notifyIntegration: () => {
          this.notifyIntegration();
        },
        onPresentationComplete: () => {
          this.synchronizeHostPresentation();
        },
        operationOwner: this.operationOwner,
        options,
        stateCoordinator: this.stateCoordinator,
        uniquenessValidator,
      });

      if (hasHostRefreshCapability(host)) {
        refreshOperationRunner = new RefreshOperationRunner({
          editor: this,
          errorReporter,
          eventTarget: host.eventTarget,
          host,
          interactionCoordinator: this.interactionCoordinator,
          language: this.language,
          notifyIntegration: () => {
            this.notifyIntegration();
          },
          operationOwner: this.operationOwner,
          options,
          prepareForExternalOperation: async () => {
            await inlineController?.prepareForExternalOperation();
          },
          stateCoordinator: this.stateCoordinator,
        });
      }
    } catch (error: unknown) {
      refreshOperationRunner?.destroy();
      dialogController?.destroy();
      inlineController?.destroy();
      this.operationOwner.destroy();
      this.interactionCoordinator.destroy();
      deleteEditorInstance(host.ownershipKey, this);
      throw error;
    }

    this.inlineController = inlineController;
    this.dialogController = dialogController;
    this.refreshOperationRunner = refreshOperationRunner;
    this.notifyIntegration();
  }

  /** Opens the Create dialog. */
  public openCreateDialog(): Promise<void> {
    return this.dialogController.openCreate();
  }

  /** Opens Dialog Edit for one explicit or selected Host target. */
  public openEditDialog(target?: TTarget): Promise<void> {
    return this.dialogController.openEdit(target);
  }

  /** Opens Remove confirmation for explicit or selected Host targets. */
  public openRemoveDialog(targets?: readonly TTarget[]): Promise<void> {
    return this.dialogController.openRemove(targets);
  }

  /** Runs the configured Host refresh operation. */
  public refresh(): Promise<void> {
    if (this.refreshOperationRunner === undefined) {
      return Promise.reject(
        new EditorConfigurationError('Refresh is not supported by the configured Host.'),
      );
    }
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

  /** Opens one eligible inline target supplied by a Host integration. */
  public async openInlineEdit(target: unknown): Promise<void> {
    try {
      this.assertInlineEditAvailable();
      await this.inlineController.open(target);
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

  /** Cancels the active inline session and safely restores its presentation. */
  public cancelInlineEdit(): Promise<void> {
    try {
      this.assertInlineEditAvailable();
      return this.inlineController.cancel();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /** Returns the independent inline presentation state. */
  public getInlineState(): Readonly<HostInlineState> {
    this.assertInlineEditAvailable();
    return this.inlineController.getState();
  }

  /** Returns whether inline activation, validation, or submission is active. */
  public isInlineEditing(): boolean {
    this.assertInlineEditAvailable();
    return this.inlineController.isEditing();
  }

  /** Aborts owned work, removes DOM and listeners, and releases the Host. */
  public destroy(): void {
    if (this.stateCoordinator.getState().status === 'destroyed') {
      return;
    }

    this.dialogController.destroy();
    this.refreshOperationRunner?.destroy();
    this.operationOwner.destroy();
    this.inlineController.destroy();
    this.interactionCoordinator.destroy();
    this.stateCoordinator.destroy();
    deleteEditorInstance(this.host.ownershipKey, this);
    this.notifyIntegration();
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:destroy'>(
      this.host.eventTarget,
      'alteditor-lite:destroy',
      {
        editor: this,
        mode: 'api',
        type: 'destroy',
      },
    );
    this.host.destroy();
  }

  private assertInlineEditAvailable(): void {
    this.stateCoordinator.assertActive();
    if (!this.capabilities.inlineEdit) {
      throw new EditorConfigurationError(
        'Inline Edit is disabled by editing.inline.enabled.',
      );
    }
  }

  private notifyIntegration(): void {
    if (hasHostPresentationCapability(this.host)) {
      this.host.notifyEditorStateChange();
    }
  }

  private synchronizeHostPresentation(): void {
    if (hasHostPresentationCapability(this.host)) {
      this.host.completeEditorPresentation();
    }
  }

  private getIntegrationButtonStateInput(): object {
    const interactionOwner = this.interactionCoordinator.current();
    const isReady =
      this.stateCoordinator.getState().status === 'ready' &&
      (interactionOwner === 'none' ||
        (interactionOwner === 'inline' &&
          this.inlineController.allowsExternalOperation()));
    let hasSelect = false;
    let selectedRowCount = 0;
    if (hasHostSelectionCapability<TTarget>(this.host)) {
      try {
        selectedRowCount = this.host.getSelectedTargets().length;
        hasSelect = true;
      } catch (error: unknown) {
        if (!(error instanceof EditorSelectionUnavailableError)) {
          throw error;
        }
      }
    }
    return {
      capabilities: this.capabilities,
      hasCreate: this.capabilities.createDialog,
      hasSelect,
      isReady,
      language: this.language,
      selectedRowCount,
    };
  }
}
