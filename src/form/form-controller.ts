import {
  AltEditorLiteError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { RequestSequence } from '../core/request-sequence.js';
import { createFieldController } from '../fields/create-field-controller.js';

import { collectFormValues } from './collect-form-values.js';
import { populateFormValues } from './populate-form-values.js';
import { type FormValidationResult, validateEditorForm } from './validate-editor-form.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { DeepPartial, EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type {
  FieldController,
  FieldValidationResult,
} from '../fields/field-controller.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldPath } from '../object-path/field-path.js';

/**
 * Public controller for one rendered editor form.
 */
export interface FormController<TFormValues extends object> {
  /** Root form element. */
  readonly element: HTMLFormElement;
  /** Populates configured fields from partial nested values. */
  populate(values: Readonly<DeepPartial<TFormValues>>): void;
  /** Collects enabled, normalized field values. */
  collect(): Promise<EditorValues<TFormValues>>;
  /** Runs native constraints followed by custom field validators. */
  validate(): Promise<FormValidationResult>;
  /** Retrieves one configured controller by safe field path. */
  getField(name: FieldPath<TFormValues>): FieldController<unknown> | null;
  /** Updates interaction state while an operation owns the dialog. */
  setBusy(isBusy: boolean): void;
  /** Maps known field errors and displays remaining submission text. */
  showSubmissionError(error: AltEditorLiteError): void;
  /** Clears field and submission errors. */
  clearErrors(): void;
  /** Removes owned callbacks, controllers, and DOM. */
  destroy(): void;
}

/**
 * Default DOM-backed FormController implementation.
 */
export class EditorFormController<
  TFormValues extends object,
> implements FormController<TFormValues> {
  public readonly element: HTMLFormElement;

  private readonly controllerByName = new Map<
    string,
    ManagedFieldController<TFormValues>
  >();

  private readonly fieldControllerByName = new Map<string, FieldController<unknown>>();

  private readonly lifecycleAbortController = new AbortController();

  private readonly submissionErrorElement: HTMLDivElement;

  private readonly validationSequence = new RequestSequence();

  private activeChangeAbortController: AbortController | undefined;

  private activeValidationAbortController: AbortController | undefined;

  private controllers: ManagedFieldController<TFormValues>[] = [];

  private isDestroyed = false;

  /**
   * Creates fields in stable configuration order.
   *
   * @param fields - Validated field configurations.
   * @param instanceId - Instance-scoped DOM prefix.
   * @param language - Complete resolved language.
   */
  public constructor(
    fields: readonly FieldConfig<TFormValues>[],
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.element = document.createElement('form');
    this.element.className = 'dt-alteditor-lite-form';
    this.element.id = `${instanceId}-form`;
    this.element.noValidate = true;

    this.submissionErrorElement = document.createElement('div');
    this.submissionErrorElement.className = 'dt-alteditor-lite-form__submission-error';
    this.submissionErrorElement.hidden = true;
    this.submissionErrorElement.setAttribute('role', 'alert');
    this.element.append(this.submissionErrorElement);

    for (const [fieldIndex, config] of fields.entries()) {
      if (config.editable === false) {
        continue;
      }

      const controller = createFieldController(
        config,
        `${instanceId}-field-${String(fieldIndex)}`,
        language,
        () => {
          this.notifyFieldChange(config.name);
        },
      );
      this.controllers.push(controller);
      this.controllerByName.set(config.name, controller);
      this.element.append(controller.element);

      if (Object.hasOwn(config, 'defaultValue')) {
        controller.setValue(config.defaultValue);
      }
    }
  }

  /** Populates configured fields from nested values. */
  public populate(values: Readonly<DeepPartial<TFormValues>>): void {
    this.assertActive();
    populateFormValues(this.controllers, values);
  }

  /** Collects enabled normalized values. */
  public async collect(): Promise<EditorValues<TFormValues>> {
    this.assertActive();
    return await collectFormValues(
      this.controllers,
      this.lifecycleAbortController.signal,
    );
  }

  /** Runs native and custom validation. */
  public async validate(): Promise<FormValidationResult> {
    this.assertActive();
    this.activeValidationAbortController?.abort();
    const validationAbortController = new AbortController();
    this.activeValidationAbortController = validationAbortController;
    const signal = AbortSignal.any([
      validationAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const requestSequence = this.validationSequence.next();
    this.clearErrors();

    const validationResult = await validateEditorForm(
      this.controllers,
      async () => await collectFormValues(this.controllers, signal),
      signal,
    );

    if (!this.validationSequence.isCurrent(requestSequence) || signal.aborted) {
      return { fieldErrors: {}, valid: false };
    }

    for (const [fieldName, message] of Object.entries(validationResult.fieldErrors)) {
      this.controllerByName.get(fieldName)?.showError(message);
    }

    return validationResult;
  }

  /** Retrieves one public field facade. */
  public getField(name: FieldPath<TFormValues>): FieldController<unknown> | null {
    this.assertActive();
    const existingController = this.fieldControllerByName.get(name);
    if (existingController !== undefined) {
      return existingController;
    }

    const managedController = this.controllerByName.get(name);
    if (managedController === undefined) {
      return null;
    }

    let isFieldDestroyed = false;
    const fieldController: FieldController<unknown> = {
      element: managedController.element,
      getValue: () => managedController.getValue(),
      setValue: (value: unknown) => {
        managedController.setValue(value);
      },
      setDisabled: (isDisabled: boolean) => {
        managedController.setDisabled(isDisabled);
      },
      focus: () => {
        managedController.focus();
      },
      validate: async () => await this.validateManagedController(managedController),
      clearError: () => {
        managedController.clearError();
      },
      showError: (message: string) => {
        managedController.showError(message);
      },
      destroy: () => {
        if (isFieldDestroyed) {
          return;
        }

        isFieldDestroyed = true;
        managedController.destroy();
        this.controllerByName.delete(name);
        this.fieldControllerByName.delete(name);
        this.controllers = this.controllers.filter(
          (controller) => controller !== managedController,
        );
      },
    };
    this.fieldControllerByName.set(name, fieldController);
    return fieldController;
  }

  /** Updates the form busy state. */
  public setBusy(isBusy: boolean): void {
    this.assertActive();
    this.element.inert = isBusy;
    this.element.setAttribute('aria-busy', String(isBusy));
  }

  /** Maps and displays an operation error. */
  public showSubmissionError(error: AltEditorLiteError): void {
    this.assertActive();
    const submissionMessages: string[] = [];
    let hasKnownFieldError = false;

    for (const [fieldName, message] of Object.entries(error.fieldErrors ?? {})) {
      const controller = this.controllerByName.get(fieldName);
      if (controller === undefined) {
        submissionMessages.push(message);
      } else {
        hasKnownFieldError = true;
        controller.showError(message);
      }
    }

    if (!hasKnownFieldError || submissionMessages.length > 0) {
      submissionMessages.unshift(error.message);
    }

    if (submissionMessages.length > 0) {
      this.submissionErrorElement.textContent = submissionMessages.join(' ');
      this.submissionErrorElement.hidden = false;
    }
  }

  /** Clears all displayed errors. */
  public clearErrors(): void {
    this.assertActive();
    for (const controller of this.controllers) {
      controller.clearError();
    }
    this.submissionErrorElement.textContent = '';
    this.submissionErrorElement.hidden = true;
  }

  /** Removes owned form resources. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.lifecycleAbortController.abort();
    this.activeChangeAbortController?.abort();
    this.activeValidationAbortController?.abort();
    this.validationSequence.invalidate();

    for (const controller of this.controllers) {
      controller.destroy();
    }

    this.controllers = [];
    this.controllerByName.clear();
    this.fieldControllerByName.clear();
    this.element.remove();
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }

  private notifyFieldChange(fieldName: string): void {
    void this.runFieldChange(fieldName);
  }

  private async runFieldChange(fieldName: string): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.activeChangeAbortController?.abort();
    const changeAbortController = new AbortController();
    this.activeChangeAbortController = changeAbortController;
    const signal = AbortSignal.any([
      changeAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const controller = this.controllerByName.get(fieldName);

    if (controller === undefined) {
      return;
    }

    try {
      const values = await collectFormValues(this.controllers, signal);
      await controller.runOnChange(values, signal);
    } catch (error: unknown) {
      if (!signal.aborted) {
        this.showSubmissionError(
          error instanceof AltEditorLiteError
            ? error
            : new AltEditorLiteError({
                cause: error,
                code: 'FIELD_CHANGE',
                message: 'A field change callback failed.',
                retryable: true,
              }),
        );
      }
    }
  }

  private async validateManagedController(
    controller: ManagedFieldController<TFormValues>,
  ): Promise<FieldValidationResult> {
    this.assertActive();
    controller.clearError();
    const nativeResult = controller.validateNative();

    if (!nativeResult.valid) {
      controller.showError(nativeResult.message ?? 'Enter a valid value.');
      return nativeResult;
    }

    const validationAbortController = new AbortController();
    const signal = AbortSignal.any([
      validationAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const values = await collectFormValues(this.controllers, signal);
    const customResult = await controller.validateCustom(values, signal);

    if (!customResult.valid) {
      controller.showError(customResult.message ?? 'Enter a valid value.');
    }

    return customResult;
  }
}
