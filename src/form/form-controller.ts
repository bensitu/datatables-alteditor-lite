import {
  AltEditorLiteError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { hasOwn } from '../core/has-own.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { RequestSequence } from '../core/request-sequence.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { createFieldController } from '../fields/create-field-controller.js';
import { resolveFieldCapabilities } from '../fields/field-capabilities.js';
import { resolveFieldValueComparator } from '../fields/field-value-comparator.js';

import {
  collectFormState,
  collectFormValues,
  type CollectedFormState,
} from './collect-form-values.js';
import { FieldRuntimeController } from './field-runtime-controller.js';
import { FieldValidationController } from './field-validation-controller.js';
import {
  FormDependencyController,
  type DependencyFieldBinding,
} from './form-dependency-controller.js';
import {
  FormValidationRunner,
  type ValidationExecutionResult,
} from './form-validation-runner.js';
import { DefaultFormLayout } from './layout/default-form-layout.js';
import { TemplateFormLayout } from './layout/template-form-layout.js';
import { populateFormValues } from './populate-form-values.js';
import {
  type EditorFormValidationResult,
  type LocalUniqueValidator,
  validateEditorForm,
} from './validate-editor-form.js';

import type { FormDependencies } from './form-dependency.js';
import type { FormValidationRequestContext, FormValidator } from './form-validation.js';
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
  validate(): Promise<EditorFormValidationResult>;
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

/** Stable values and field metadata returned for one dialog submission. */
export type FormSubmissionValidationResult<TFormValues extends object> =
  | {
      readonly valid: false;
      readonly error: AltEditorLiteError;
    }
  | {
      readonly valid: true;
      readonly values: Readonly<EditorValues<TFormValues>>;
      readonly fieldValues: ReadonlyMap<string, unknown>;
    };

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

  private readonly configuredFieldNames: ReadonlySet<string>;

  private readonly comparatorByName = new Map<
    string,
    (left: unknown, right: unknown) => boolean
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

  private readonly fieldValidation: FieldValidationController<TFormValues>;

  private readonly invalidMessage: string;

  private readonly layout: FormLayout;

  private dependencyController: FormDependencyController<TFormValues> | undefined;

  private operationErrorMessage: string | undefined;

  private validationErrorMessage: string | undefined;

  private activeFormValidationAbortController: AbortController | undefined;

  private controllers: ManagedFieldController<TFormValues>[] = [];

  private isDestroyed = false;

  private dirtyBaseline: ReadonlyMap<string, unknown> | undefined;

  private cleanRevision = -1;

  public revision = 0;

  public onMutation: (() => void) | undefined;

  private recordMutation(fieldName?: string): void {
    if (fieldName !== undefined) {
      this.fieldValidation.invalidate(fieldName, true);
    }
    this.revision += 1;
    this.onMutation?.();
  }

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
    this.configuredFieldNames = new Set(fields.map(({ name }) => name));
    this.element = document.createElement('form');
    this.element.className = 'alteditor-lite-form';
    this.element.id = `${instanceId}-form`;
    this.element.noValidate = true;
    this.invalidMessage = language.validation.invalid;
    this.fieldValidation = new FieldValidationController(
      this.element,
      this.invalidMessage,
    );
    this.layout =
      template === undefined
        ? new DefaultFormLayout()
        : new TemplateFormLayout(template, fields, instanceId);

    this.submissionErrorElement = document.createElement('div');
    this.submissionErrorElement.className = 'alteditor-lite-form__submission-error';
    this.submissionErrorElement.hidden = true;
    this.submissionErrorElement.setAttribute('role', 'alert');
    this.element.append(this.layout.element, this.submissionErrorElement);

    try {
      for (const [fieldIndex, config] of fields.entries()) {
        if (!resolveFieldCapabilities(config).dialog) {
          continue;
        }

        const controller = createFieldController(
          config,
          `${instanceId}-field-${String(fieldIndex)}`,
          language,
          () => {
            this.notifyFieldChange(config.name);
          },
          undefined,
          this.lifecycleAbortController.signal,
        );
        this.controllers.push(controller);
        this.controllerByName.set(config.name, controller);
        this.comparatorByName.set(config.name, resolveFieldValueComparator(config));
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

        this.fieldValidation.register(
          controller,
          config.validateOn,
          async (signal) => await this.validateManagedController(controller, signal),
        );

        if (hasOwn(config, 'defaultValue')) {
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
              this.fieldValidation.forgetError(sourcePath);
              controller?.showError(error.message);
              onDependencyError?.(sourcePath, error);
            }
            this.renderSubmissionError();
          },
          afterApplyPatch: ({ targetPath }) => {
            this.recordMutation(targetPath);
          },
        });
      }
    } catch (error: unknown) {
      try {
        this.destroy();
      } catch {
        // Continue returning the construction failure.
      }
      throw error;
    }
  }

  /** Populates configured fields from nested values. */
  public populate(values: Readonly<DeepPartial<TFormValues>>): void {
    this.assertActive();
    populateFormValues(this.controllers, values);
    this.recordMutation();
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
    this.recordMutation();
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

  /** Captures the current settled field values as the clean dialog state. */
  public async rebaseDirtyState(): Promise<void> {
    this.assertActive();
    // A failed read must not revive the snapshot from before a successful save.
    this.dirtyBaseline = undefined;
    this.cleanRevision = this.revision;
    await this.waitForCurrentFieldWork();
    const revision = this.revision;
    const state = await collectFormState(
      this.controllers,
      this.lifecycleAbortController.signal,
    );
    this.dirtyBaseline = state.fieldValues;
    this.cleanRevision = revision;
  }

  /** Compares current values with the latest clean dialog state when needed. */
  public async isDirty(): Promise<boolean> {
    this.assertActive();
    if (this.cleanRevision === this.revision) {
      return false;
    }
    await this.waitForCurrentFieldWork();
    const baseline = this.dirtyBaseline;
    if (baseline === undefined) {
      return true;
    }
    const revision = this.revision;
    const current = await collectFormState(
      this.controllers,
      this.lifecycleAbortController.signal,
    );
    if (revision !== this.revision || current.fieldValues.size !== baseline.size) {
      return true;
    }
    for (const [name, baselineValue] of baseline) {
      if (!current.fieldValues.has(name)) {
        return true;
      }
      const isEqual = this.comparatorByName.get(name) ?? Object.is;
      if (!isEqual(baselineValue, current.fieldValues.get(name))) {
        return true;
      }
    }
    this.cleanRevision = revision;
    return false;
  }

  /** Runs native and custom validation. */
  public async validate(): Promise<EditorFormValidationResult> {
    this.assertActive();
    const resumeFieldValidation = this.fieldValidation.suspend();
    this.activeFormValidationAbortController?.abort();
    const validationAbortController = new AbortController();
    this.activeFormValidationAbortController = validationAbortController;
    const mergedSignal = mergeAbortSignals([
      validationAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const { signal } = mergedSignal;
    const requestSequence = this.validationSequence.next();
    try {
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

      let validationResult: EditorFormValidationResult;
      try {
        validationResult = await validateEditorForm(
          this.controllers,
          async () => await collectFormValues(this.controllers, signal),
          signal,
          this.validateUnique,
          this.invalidMessage,
        );
      } catch (error: unknown) {
        if (!this.validationSequence.isCurrent(requestSequence)) {
          return { fieldErrors: {}, valid: false };
        }
        throw error;
      }

      if (!this.validationSequence.isCurrent(requestSequence)) {
        return { fieldErrors: {}, valid: false };
      }

      for (const [fieldName, message] of Object.entries(validationResult.fieldErrors)) {
        this.controllerByName.get(fieldName)?.showError(message);
      }

      return validationResult;
    } finally {
      resumeFieldValidation();
      mergedSignal.dispose();
    }
  }

  /** Runs one operation-owned validation and returns its exact collected values. */
  public async validateForSubmission(
    operationSignal: AbortSignal,
    validateForm: FormValidator<TFormValues> | undefined,
    context: FormValidationRequestContext,
  ): Promise<FormSubmissionValidationResult<TFormValues>> {
    this.assertActive();
    const resumeFieldValidation = this.fieldValidation.suspend();
    this.activeFormValidationAbortController?.abort();
    const validationAbortController = new AbortController();
    this.activeFormValidationAbortController = validationAbortController;
    const mergedSignal = mergeAbortSignals([
      validationAbortController.signal,
      this.lifecycleAbortController.signal,
      operationSignal,
    ]);
    const { signal } = mergedSignal;
    const requestSequence = this.validationSequence.next();

    try {
      await this.waitForCurrentFieldWork();
      signal.throwIfAborted();
      if (!this.validationSequence.isCurrent(requestSequence)) {
        throw new DOMException('The validation request was replaced.', 'AbortError');
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
        return {
          error: new AltEditorLiteError({
            code: 'VALIDATION',
            fieldErrors,
            message: this.invalidMessage,
            retryable: true,
          }),
          valid: false,
        };
      }

      let collectedForm: CollectedFormState<TFormValues> | undefined;
      const result: ValidationExecutionResult<TFormValues> =
        await new FormValidationRunner<TFormValues>({
          allowedFieldNames: this.configuredFieldNames,
          collectValues: async (currentSignal) => {
            collectedForm = await collectFormState(this.controllers, currentSignal);
            return collectedForm.values;
          },
          controllers: this.controllers,
          invalidMessage: this.invalidMessage,
          ...(this.validateUnique === undefined
            ? {}
            : { validateUnique: this.validateUnique }),
          ...(validateForm === undefined
            ? {}
            : {
                validateForm: async (values, currentSignal) =>
                  await Promise.resolve(
                    validateForm(
                      values,
                      Object.freeze({ ...context, signal: currentSignal }),
                    ),
                  ),
              }),
        }).run(signal);

      signal.throwIfAborted();
      if (!this.validationSequence.isCurrent(requestSequence)) {
        throw new DOMException('The validation request was replaced.', 'AbortError');
      }
      if (!result.valid) {
        this.showValidationError(result.error, result.message);
        return { error: result.error, valid: false };
      }
      if (collectedForm === undefined) {
        throw new Error('Validation completed without collecting form values.');
      }
      return {
        fieldValues: collectedForm.fieldValues,
        valid: true,
        values: result.values,
      };
    } finally {
      resumeFieldValidation();
      mergedSignal.dispose();
    }
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
        this.recordMutation(name);
        managedController.setValue(value);
      },
      ...(getOptions === undefined || setOptions === undefined
        ? {}
        : {
            getOptions: () => getOptions(),
            setOptions: (options: readonly SelectOption[]) => {
              this.recordMutation(name);
              setOptions(options);
            },
          }),
      isVisible: () => runtime.isVisible(),
      setVisible: (isVisible: boolean) => {
        runtime.setVisible(isVisible);
      },
      isDisabled: () => runtime.isDisabled(),
      setDisabled: (isDisabled: boolean) => {
        this.recordMutation(name);
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
      validate: async () => await this.fieldValidation.validate(name, 'manual'),
      clearError: () => {
        this.fieldValidation.forgetError(name);
        managedController.clearError();
      },
      showError: (message: string) => {
        this.fieldValidation.forgetError(name);
        managedController.showError(message);
      },
      destroy: () => {
        if (isFieldDestroyed) {
          return;
        }

        isFieldDestroyed = true;
        this.recordMutation();
        this.activeChangeAbortControllers.get(name)?.abort();
        this.activeChangeAbortControllers.delete(name);
        this.fieldValidation.remove(name);
        this.activeFormValidationAbortController?.abort();
        this.controllerByName.delete(name);
        this.fieldControllerByName.delete(name);
        this.runtimeByName.delete(name);
        this.dependencyFieldByName.delete(name);
        this.dependencyController?.abortSource(name);
        this.controllers = this.controllers.filter(
          (controller) => controller !== managedController,
        );
        runCleanupSteps([
          () => {
            runtime.setVisible(false);
          },
          () => {
            managedController.destroy();
          },
        ]);
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
        this.fieldValidation.forgetError(fieldName);
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
      this.fieldValidation.forgetError(controller.name);
    }
    this.operationErrorMessage = undefined;
    this.validationErrorMessage = undefined;
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
    this.onMutation = undefined;
    this.lifecycleAbortController.abort();
    for (const abortController of this.activeChangeAbortControllers.values()) {
      abortController.abort();
    }
    this.activeChangeAbortControllers.clear();
    this.activeChangeTasks.clear();
    this.fieldValidation.destroy();
    this.activeFormValidationAbortController?.abort();
    this.validationSequence.invalidate();
    const dependencyController = this.dependencyController;
    this.dependencyController = undefined;
    const controllers = this.controllers;
    this.controllers = [];
    this.controllerByName.clear();
    this.fieldControllerByName.clear();
    this.runtimeByName.clear();
    this.dependencyFieldByName.clear();
    runCleanupSteps([
      () => {
        dependencyController?.destroy();
      },
      ...controllers.map((controller) => () => {
        controller.destroy();
      }),
      () => {
        this.layout.destroy();
      },
      () => {
        this.element.remove();
      },
    ]);
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }

  private notifyFieldChange(fieldName: string): void {
    this.recordMutation(fieldName);
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
    const mergedSignal = mergeAbortSignals([
      changeAbortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const { signal } = mergedSignal;
    try {
      const dependencyValues = freezeEditorValues<TFormValues>(
        await collectFormValues(this.controllers, signal),
      );
      let callbackValues = dependencyValues;
      if (this.dependencyController !== undefined) {
        await this.dependencyController.handleUserChange(
          fieldName,
          dependencyValues,
          signal,
        );
        signal.throwIfAborted();
        callbackValues = await collectFormValues(this.controllers, signal);
      }
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
        let didShowAssociatedError = false;
        let hasUnmatchedError = false;
        for (const [errorFieldName, fieldMessage] of Object.entries(
          operationError.fieldErrors ?? {},
        )) {
          const errorController = this.controllerByName.get(errorFieldName);
          if (errorController === undefined) {
            hasUnmatchedError = true;
          } else {
            this.fieldValidation.forgetError(errorFieldName);
            errorController.showError(fieldMessage);
            didShowAssociatedError = true;
          }
        }
        if (!didShowAssociatedError || hasUnmatchedError) {
          this.fieldValidation.forgetError(fieldName);
          controller.showError(operationError.message);
        }
      }
    } finally {
      mergedSignal.dispose();
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
    if (this.validationErrorMessage !== undefined) {
      messages.add(this.validationErrorMessage);
    }
    for (const error of this.dependencyController?.errors().values() ?? []) {
      messages.add(error.message);
    }
    this.submissionErrorElement.textContent = [...messages].join(' ');
    this.submissionErrorElement.hidden = messages.size === 0;
  }

  private showValidationError(
    error: AltEditorLiteError,
    message: string | undefined,
  ): void {
    const submissionMessages = new Set<string>();
    if (message !== undefined) {
      submissionMessages.add(message);
    }
    for (const [fieldName, fieldMessage] of Object.entries(error.fieldErrors ?? {})) {
      const controller = this.controllerByName.get(fieldName);
      if (controller === undefined) {
        submissionMessages.add(fieldMessage);
      } else {
        this.fieldValidation.forgetError(fieldName);
        controller.showError(fieldMessage);
      }
    }
    this.validationErrorMessage =
      submissionMessages.size === 0 ? undefined : [...submissionMessages].join(' ');
    this.renderSubmissionError();
  }

  private async validateManagedController(
    controller: ManagedFieldController<TFormValues>,
    signal: AbortSignal,
  ): Promise<FieldValidationResult> {
    this.assertActive();
    const nativeResult = controller.validateNative();
    if (!nativeResult.valid) {
      return nativeResult;
    }
    const values = await collectFormValues(this.controllers, signal);
    signal.throwIfAborted();
    const customResult = await controller.validateCustom(values, signal);
    signal.throwIfAborted();
    if (!customResult.valid) {
      return customResult;
    }
    const uniqueMessage = this.validateUnique?.(values)[controller.name];
    return uniqueMessage === undefined
      ? customResult
      : { message: uniqueMessage, valid: false };
  }
}
