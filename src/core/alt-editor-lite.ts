import { EditorDialog } from '../dialog/editor-dialog.js';
import { validateFieldConfigurations } from '../fields/validate-field-configurations.js';
import { buildEditorForm } from '../form/build-editor-form.js';
import { createInstanceId } from '../instance/create-instance-id.js';
import {
  deleteEditorInstance,
  storeEditorInstance,
} from '../instance/editor-instance-store.js';

import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorOperationBusyError,
} from './alt-editor-lite-error.js';
import {
  resolveLanguage,
  type AltEditorLiteLanguage,
} from './alt-editor-lite-language.js';
import { dispatchEditorEvent, type EditorCloseReason } from './editor-event.js';
import { assertEditorStateTransition } from './editor-state-transition.js';

import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';
import type { EditorState } from './editor-state.js';
import type { DeepPartial } from './editor-values.js';
import type { FieldController } from '../fields/field-controller.js';
import type { FormController } from '../form/form-controller.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api } from 'datatables.net';

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function normalizeCreateError(
  error: unknown,
  language: Readonly<AltEditorLiteLanguage>,
): AltEditorLiteError {
  return error instanceof AltEditorLiteError
    ? error
    : new AltEditorLiteError({
        cause: error,
        code: 'CREATE_FAILED',
        message: language.errors.generic,
        retryable: true,
      });
}

function normalizeRejectedReason(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('AltEditorLite failed with a non-Error value.', {
        cause: error,
      });
}

/**
 * Lightweight native editor bound to one DataTables API instance.
 *
 * The current API supports synchronous client-side Create.
 */
export class AltEditorLite<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> {
  private readonly dialog: EditorDialog;

  private readonly instanceId = createInstanceId();

  private readonly language: Readonly<AltEditorLiteLanguage>;

  private readonly tableElement: HTMLTableElement;

  private activeForm: FormController<TFormValues> | undefined;

  private state: EditorState = { status: 'ready' };

  /**
   * Creates the sole active editor for a DataTables table.
   *
   * @param table - Public DataTables API for the owned table.
   * @param options - Fields and synchronous Create configuration.
   * @throws EditorAlreadyInitializedError when the table already has an editor.
   * @throws EditorConfigurationError for invalid field configuration.
   */
  public constructor(
    private readonly table: Api<TRow>,
    private readonly options: AltEditorLiteOptions<TRow, TFormValues>,
  ) {
    validateFieldConfigurations(options.fields);
    this.language = resolveLanguage(options.language);
    this.tableElement = table.table().node();
    storeEditorInstance(this.tableElement, this);

    try {
      this.dialog = new EditorDialog(this.tableElement, this.instanceId, this.language);
    } catch (error: unknown) {
      deleteEditorInstance(this.tableElement, this);
      throw error;
    }
  }

  /**
   * Opens the synchronous client-side Create dialog.
   *
   * @returns A promise resolved after the modal is open and focused.
   * @throws EditorConfigurationError when `clientSide.createRow` is absent.
   * @throws EditorOperationBusyError unless the editor is ready.
   */
  public openCreateDialog(): Promise<void> {
    try {
      this.assertActive();

      if (this.options.clientSide?.createRow === undefined) {
        throw new EditorConfigurationError('Create requires clientSide.createRow.');
      }

      if (this.state.status !== 'ready') {
        throw new EditorOperationBusyError();
      }

      this.transitionTo({ action: 'create', status: 'opening' });
      const form = buildEditorForm(this.options.fields, this.instanceId, this.language);
      this.activeForm = form;

      try {
        this.dialog.open(form.element, this.language.dialog.createTitle, {
          onRequestClose: (reason) => {
            this.closeDialogNow(reason);
          },
          onSubmit: () => {
            this.beginCreateSubmission();
          },
        });
      } catch (error: unknown) {
        form.destroy();
        this.activeForm = undefined;
        this.transitionTo({ status: 'ready' });
        throw error;
      }

      this.transitionTo({ action: 'create', status: 'open' });
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:open'>(
        this.tableElement,
        'alteditor-lite:open',
        {
          editor: this,
          operation: 'create',
          type: 'open',
        },
      );
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(normalizeRejectedReason(error));
    }
  }

  /**
   * Closes an open dialog after complete cleanup and focus restoration.
   *
   * @returns A promise resolved after close observers have been notified.
   * @throws EditorOperationBusyError when submission owns the dialog.
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
   * Returns the current immutable-by-contract lifecycle state.
   *
   * @returns Current editor state.
   */
  public getState(): Readonly<EditorState> {
    this.assertActive();
    return this.state;
  }

  /**
   * Aborts owned work, removes DOM, releases the table, and emits destroy once.
   */
  public destroy(): void {
    if (this.state.status === 'destroyed') {
      return;
    }

    this.activeForm?.destroy();
    this.activeForm = undefined;
    this.dialog.destroy();
    this.transitionTo({ status: 'destroyed' });
    deleteEditorInstance(this.tableElement, this);
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

  private beginCreateSubmission(): void {
    void this.submitCreate();
  }

  private async submitCreate(): Promise<void> {
    const form = this.activeForm;
    if (this.state.status !== 'open' || form === undefined) {
      return;
    }

    this.transitionTo({ action: 'create', status: 'submitting' });
    form.setBusy(true);
    this.dialog.setBusy(true);
    form.clearErrors();
    this.dialog.clearError();

    try {
      const validationResult = await form.validate();
      if (this.isDestroyed()) {
        return;
      }

      if (!validationResult.valid) {
        form.setBusy(false);
        this.dialog.setBusy(false);
        this.transitionTo({ action: 'create', status: 'open' });
        this.dialog.focusInvalidField();
        return;
      }

      const values = await form.collect();
      if (this.isDestroyed()) {
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
      if (this.isDestroyed()) {
        return;
      }

      const clientSide = this.options.clientSide;
      if (clientSide?.createRow === undefined) {
        throw new EditorConfigurationError('Create requires clientSide.createRow.');
      }

      const rowCandidate: unknown = clientSide.createRow(values);
      if (this.isDestroyed()) {
        return;
      }
      if (isPromiseLike(rowCandidate)) {
        throw new EditorConfigurationError(
          'clientSide.createRow must return synchronously.',
        );
      }
      if (typeof rowCandidate !== 'object' || rowCandidate === null) {
        throw new EditorConfigurationError(
          'clientSide.createRow must return a complete row object.',
        );
      }

      const row = rowCandidate as TRow;
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
      if (this.isDestroyed()) {
        return;
      }

      if (this.options.closeOnSuccess ?? true) {
        this.closeAfterSuccess();
      } else {
        form.setBusy(false);
        this.dialog.setBusy(false);
        this.transitionTo({ action: 'create', status: 'open' });
      }
    } catch (error: unknown) {
      if (this.isDestroyed()) {
        return;
      }

      const createError = normalizeCreateError(error, this.language);
      form.setBusy(false);
      this.dialog.setBusy(false);
      form.showSubmissionError(createError);
      this.dialog.showError(createError.message);
      this.transitionTo({
        action: 'create',
        status: 'open',
        submissionError: createError,
      });
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:error'>(
        this.tableElement,
        'alteditor-lite:error',
        {
          editor: this,
          error: createError,
          operation: 'create',
          type: 'error',
        },
      );
    }
  }

  private closeAfterSuccess(): void {
    if (this.state.status !== 'submitting') {
      throw new EditorOperationBusyError();
    }

    this.transitionTo({ action: 'create', status: 'closing' });
    this.finishClose('success');
  }

  private closeDialogNow(reason: Exclude<EditorCloseReason, 'success'>): void {
    this.assertActive();

    if (this.state.status === 'ready') {
      return;
    }

    if (this.state.status !== 'open') {
      throw new EditorOperationBusyError();
    }

    this.transitionTo({ action: 'create', status: 'closing' });
    this.finishClose(reason);
  }

  private finishClose(reason: EditorCloseReason): void {
    this.dialog.close();
    this.activeForm?.destroy();
    this.activeForm = undefined;
    this.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:close'>(
      this.tableElement,
      'alteditor-lite:close',
      {
        editor: this,
        operation: 'create',
        reason,
        type: 'close',
      },
    );
  }

  private isDestroyed(): boolean {
    return this.state.status === 'destroyed';
  }

  private transitionTo(nextState: EditorState): void {
    assertEditorStateTransition(this.state, nextState);
    this.state = nextState;
  }
}
