import {
  AltEditorLiteError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { RequestSequence } from '../core/request-sequence.js';
import { createFieldController } from '../fields/create-field-controller.js';

import {
  collectFormState,
  collectFormValues,
  type CollectedFormState,
} from './collect-form-values.js';
import { FieldRuntimeController } from './field-runtime-controller.js';
import {
  FormDependencyController,
  type DependencyFieldBinding,
} from './form-dependency-controller.js';
import { DefaultFormLayout } from './layout/default-form-layout.js';
import { TemplateFormLayout } from './layout/template-form-layout.js';
import { populateFormValues } from './populate-form-values.js';
import {
  type FormValidationResult,
  type LocalUniqueValidator,
  validateEditorForm,
} from './validate-editor-form.js';

import type { FormDependencies } from './form-dependency.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { DeepPartial, EditorValues } from '../core/editor-values.js';
import type { FieldConfig, SelectOption } from '../fields/field-config.js';
import type {
  FieldController,
  FieldValidationResult,
} from '../fields/field-controller.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FormLayout } from './layout/form-layout.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';

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
  getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null;
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

  private readonly runtimeByName = new Map<string, FieldRuntimeController<TFormValues>>();

  private readonly dependencyFieldByName = new Map<
    string,
    DependencyFieldBinding<TFormValues>
  >();

  private readonly lifecycleAbortController = new AbortController();

  private readonly submissionErrorElement: HTMLDivElement;

  private readonly validationSequence = new RequestSequence();

  private readonly activeChangeAbortControllers = new Map<string, AbortController>();

  private readonly activeChangeTasks = new Map<string, Promise<void>>();

  private readonly activeFieldValidationAbortControllers = new Map<
    string,
    AbortController
  >();

  private readonly invalidMessage: string;

  private readonly layout: FormLayout;

  private dependencyController: FormDependencyController<TFormValues> | undefined;

  private operationErrorMessage: string | undefined;

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
    private readonly validateUnique?: LocalUniqueValidator<TFormValues>,
    template?: DialogTemplateSource,
    dependencies?: Readonly<FormDependencies<TFormValues>>,
    onDependencyError?: (sourcePath: string, error: AltEditorLiteError) => void,
  ) {
    this.element = document.createElement('form');
    this.element.className = 'dt-alteditor-lite-form';
    this.element.id = `${instanceId}-form`;
    this.element.noValidate = true;
    this.invalidMessage = language.validation.invalid;
    this.layout =
      template === undefined
        ? new DefaultFormLayout()
        : new TemplateFormLayout(template, fields, instanceId);

    this.submissionErrorElement = document.createElement('div');
    this.submissionErrorElement.className = 'dt-alteditor-lite-form__submission-error';
    this.submissionErrorElement.hidden = true;
    this.submissionErrorElement.setAttribute('role', 'alert');
    this.element.append(this.layout.element, this.submissionErrorElement);

    try {
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
        const mountPoint = this.layout.mountField(config.name, controller.element);
        const runtime = new FieldRuntimeController({
          config,
          controller,
          disabled: config.disabled ?? false,
          mountPoint,
          readOnly: 'readOnly' in config && config.readOnly,
          required: 'required' in config && config.required,
          visible: config.type !== 'hidden' && config.visible !== false,
        });
        this.runtimeByName.set(config.name, runtime);
        this.dependencyFieldByName.set(config.name, {
          config,
          controller,
          runtime,
        });
        runtime.setVisible(runtime.isVisible());
        runtime.setDisabled(runtime.isDisabled());
        runtime.setReadOnly(runtime.isReadOnly());
        runtime.setRequired(runtime.isRequired());

        if (Object.hasOwn(config, 'defaultValue')) {
          controller.setValue(config.defaultValue);
        }
      }
      if (dependencies !== undefined && Object.keys(dependencies).length > 0) {
        this.dependencyController = new FormDependencyController({
          dependencies,
          fields: this.dependencyFieldByName,
          lifecycleSignal: this.lifecycleAbortController.signal,
          normalizeError: (error) =>
            error instanceof AltEditorLiteError
              ? error
              : new AltEditorLiteError({
                  cause: error,
                  code: 'FIELD_DEPENDENCY',
                  message: language.errors.generic,
                  retryable: true,
                }),
          onErrorChange: (sourcePath, error) => {
            const controller = this.controllerByName.get(sourcePath);
            if (error === undefined) {
              controller?.clearError();
            } else {
              controller?.showError(error.message);
              onDependencyError?.(sourcePath, error);
            }
            this.renderSubmissionError();
          },
        });
      }
    } catch (error: unknown) {
      this.destroy();
      throw error;
    }
  }

  /** Populates configured fields from nested values. */
  public populate(values: Readonly<DeepPartial<TFormValues>>): void {
    this.assertActive();
    populateFormValues(this.controllers, values);
  }

  /**
   * Populates matching configured paths from a row-shaped source object.
   *
   * This internal boundary keeps `TRow` and `TFormValues` separate: paths
   * absent from the row retain their configured defaults.
   *
   * @param sourceValues - Row snapshot read through safe configured paths.
   */
  public populateFromSource(sourceValues: Readonly<object>): void {
    this.assertActive();
    populateFormValues(this.controllers, sourceValues);
  }

  /** Resolves dependencies after defaults or source values are populated. */
  public async initializeDependencies(): Promise<void> {
    this.assertActive();
    if (this.dependencyController === undefined) {
      return;
    }
    const values = freezeEditorValues<TFormValues>(
      await collectFormValues(this.controllers, this.lifecycleAbortController.signal),
    );
    await this.dependencyController.initialize(values);
  }

  /** Collects enabled normalized values. */
  public async collect(): Promise<EditorValues<TFormValues>> {
    this.assertActive();
    return await collectFormValues(
      this.controllers,
      this.lifecycleAbortController.signal,
    );
  }

  /** Collects values with internal metadata for the built-in Update path. */
  public async collectWithMetadata(): Promise<CollectedFormState<TFormValues>> {
    this.assertActive();
    return await collectFormState(this.controllers, this.lifecycleAbortController.signal);
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
    await this.waitForCurrentFieldWork();
    if (!this.validationSequence.isCurrent(requestSequence) || signal.aborted) {
      return { fieldErrors: {}, valid: false };
    }
    this.clearErrors();

    const dependencyErrors =
      this.dependencyController?.errors() ?? new Map<string, AltEditorLiteError>();
    if (dependencyErrors.size > 0) {
      const fieldErrors: Record<string, string> = {};
      for (const [sourcePath, error] of dependencyErrors) {
        fieldErrors[sourcePath] = error.message;
        this.controllerByName.get(sourcePath)?.showError(error.message);
      }
      this.renderSubmissionError();
      return { fieldErrors, valid: false };
    }

    const validationResult = await validateEditorForm(
      this.controllers,
      async () => await collectFormValues(this.controllers, signal),
      signal,
      this.validateUnique,
      this.invalidMessage,
    );

    if (!this.validationSequence.isCurrent(requestSequence)) {
      return { fieldErrors: {}, valid: false };
    }

    for (const [fieldName, message] of Object.entries(validationResult.fieldErrors)) {
      this.controllerByName.get(fieldName)?.showError(message);
    }

    return validationResult;
  }

  /** Retrieves one public field facade. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.assertActive();
    const existingController = this.fieldControllerByName.get(name);
    if (existingController !== undefined) {
      return existingController as FieldController<FieldPathValue<TFormValues, TPath>>;
    }

    const managedController = this.controllerByName.get(name);
    const runtime = this.runtimeByName.get(name);
    if (managedController === undefined || runtime === undefined) {
      return null;
    }

    const getOptions = managedController.getOptions;
    const setOptions = managedController.setOptions;
    let isFieldDestroyed = false;
    const fieldController: FieldController<unknown> = {
      element: managedController.element,
      getValue: async () => await Promise.resolve(managedController.getValue()),
      setValue: (value: unknown) => {
        managedController.setValue(value);
      },
      ...(getOptions === undefined || setOptions === undefined
        ? {}
        : {
            getOptions: () => getOptions(),
            setOptions: (options: readonly SelectOption[]) => {
              setOptions(options);
            },
          }),
      isVisible: () => runtime.isVisible(),
      setVisible: (isVisible: boolean) => {
        runtime.setVisible(isVisible);
      },
      isDisabled: () => runtime.isDisabled(),
      setDisabled: (isDisabled: boolean) => {
        runtime.setDisabled(isDisabled);
      },
      isReadOnly: () => runtime.isReadOnly(),
      setReadOnly: (isReadOnly: boolean) => {
        runtime.setReadOnly(isReadOnly);
      },
      isRequired: () => runtime.isRequired(),
      setRequired: (isRequired: boolean) => {
        runtime.setRequired(isRequired);
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
        this.activeChangeAbortControllers.get(name)?.abort();
        this.activeChangeAbortControllers.delete(name);
        this.activeFieldValidationAbortControllers.get(name)?.abort();
        this.activeFieldValidationAbortControllers.delete(name);
        this.activeValidationAbortController?.abort();
        runtime.setVisible(false);
        managedController.destroy();
        this.controllerByName.delete(name);
        this.fieldControllerByName.delete(name);
        this.runtimeByName.delete(name);
        this.dependencyFieldByName.delete(name);
        this.dependencyController?.abortSource(name);
        this.controllers = this.controllers.filter(
          (controller) => controller !== managedController,
        );
      },
    };
    this.fieldControllerByName.set(name, fieldController);
    return fieldController as FieldController<FieldPathValue<TFormValues, TPath>>;
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

    this.operationErrorMessage =
      submissionMessages.length === 0 ? undefined : submissionMessages.join(' ');
    this.renderSubmissionError();
  }

  /** Clears all displayed errors. */
  public clearErrors(): void {
    this.assertActive();
    for (const controller of this.controllers) {
      controller.clearError();
    }
    this.operationErrorMessage = undefined;
    for (const [sourcePath, dependencyError] of this.dependencyController?.errors() ??
      []) {
      this.controllerByName.get(sourcePath)?.showError(dependencyError.message);
    }
    this.renderSubmissionError();
  }

  /** Removes owned form resources. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.lifecycleAbortController.abort();
    for (const abortController of this.activeChangeAbortControllers.values()) {
      abortController.abort();
    }
    this.activeChangeAbortControllers.clear();
    this.activeChangeTasks.clear();
    for (const abortController of this.activeFieldValidationAbortControllers.values()) {
      abortController.abort();
    }
    this.activeFieldValidationAbortControllers.clear();
    this.activeValidationAbortController?.abort();
    this.validationSequence.invalidate();
    this.dependencyController?.destroy();
    this.dependencyController = undefined;

    for (const controller of this.controllers) {
      controller.destroy();
    }

    this.controllers = [];
    this.controllerByName.clear();
    this.fieldControllerByName.clear();
    this.runtimeByName.clear();
    this.dependencyFieldByName.clear();
    this.layout.destroy();
    this.element.remove();
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }

  private notifyFieldChange(fieldName: string): void {
    const task = this.runFieldChange(fieldName);
    this.activeChangeTasks.set(fieldName, task);
    void task.finally(() => {
      if (this.activeChangeTasks.get(fieldName) === task) {
        this.activeChangeTasks.delete(fieldName);
      }
    });
  }

  private async runFieldChange(fieldName: string): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const controller = this.controllerByName.get(fieldName);
    if (controller === undefined) {
      return;
    }

    this.activeChangeAbortControllers.get(fieldName)?.abort();
    const changeAbortController = new AbortController();
    this.activeChangeAbortControllers.set(fieldName, changeAbortController);
    const signal = AbortSignal.any([
      changeAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    try {
      const dependencyValues = freezeEditorValues<TFormValues>(
        await collectFormValues(this.controllers, signal),
      );
      await this.dependencyController?.handleUserChange(
        fieldName,
        dependencyValues,
        signal,
      );
      signal.throwIfAborted();
      const callbackValues = await collectFormValues(this.controllers, signal);
      await controller.runOnChange(callbackValues, signal);
    } catch (error: unknown) {
      if (!signal.aborted) {
        const operationError =
          error instanceof AltEditorLiteError
            ? error
            : new AltEditorLiteError({
                cause: error,
                code: 'FIELD_CHANGE',
                message: 'A field change callback failed.',
                retryable: true,
              });
        controller.showError(
          operationError.fieldErrors?.[fieldName] ?? operationError.message,
        );
      }
    } finally {
      if (this.activeChangeAbortControllers.get(fieldName) === changeAbortController) {
        this.activeChangeAbortControllers.delete(fieldName);
      }
    }
  }

  private async waitForCurrentFieldWork(): Promise<void> {
    while (this.activeChangeTasks.size > 0) {
      await Promise.allSettled([...this.activeChangeTasks.values()]);
    }
    await this.dependencyController?.waitForCurrent();
  }

  private renderSubmissionError(): void {
    const messages = new Set<string>();
    if (this.operationErrorMessage !== undefined) {
      messages.add(this.operationErrorMessage);
    }
    for (const error of this.dependencyController?.errors().values() ?? []) {
      messages.add(error.message);
    }
    this.submissionErrorElement.textContent = [...messages].join(' ');
    this.submissionErrorElement.hidden = messages.size === 0;
  }

  private async validateManagedController(
    controller: ManagedFieldController<TFormValues>,
  ): Promise<FieldValidationResult> {
    this.assertActive();
    this.activeValidationAbortController?.abort();
    this.activeFieldValidationAbortControllers.get(controller.name)?.abort();
    const validationAbortController = new AbortController();
    this.activeFieldValidationAbortControllers.set(
      controller.name,
      validationAbortController,
    );
    controller.clearError();
    const nativeResult = controller.validateNative();

    if (!nativeResult.valid) {
      controller.showError(nativeResult.message ?? this.invalidMessage);
      this.activeFieldValidationAbortControllers.delete(controller.name);
      return nativeResult;
    }

    const signal = AbortSignal.any([
      validationAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    try {
      const values = await collectFormValues(this.controllers, signal);
      const customResult = await controller.validateCustom(values, signal);
      if (signal.aborted) {
        return { valid: false };
      }

      if (!customResult.valid) {
        controller.showError(customResult.message ?? this.invalidMessage);
        return customResult;
      }

      const uniqueMessage = this.validateUnique?.(values)[controller.name];
      if (uniqueMessage !== undefined) {
        const uniqueResult = { message: uniqueMessage, valid: false } as const;
        controller.showError(uniqueMessage);
        return uniqueResult;
      }

      return customResult;
    } catch {
      if (signal.aborted) {
        return { valid: false };
      }
      controller.showError(this.invalidMessage);
      return { message: this.invalidMessage, valid: false };
    } finally {
      if (
        this.activeFieldValidationAbortControllers.get(controller.name) ===
        validationAbortController
      ) {
        this.activeFieldValidationAbortControllers.delete(controller.name);
      }
    }
  }
}
