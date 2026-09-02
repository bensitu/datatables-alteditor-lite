import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { resolveBatchFieldRestriction } from '../fields/field-capabilities.js';
import { setPathValue } from '../object-path/set-path-value.js';

import { BatchFieldBinding, type BatchFieldConfig } from './batch-field-binding.js';
import { buildBatchEffectiveValues } from './build-batch-effective-values.js';
import { FieldValidationController } from './field-validation-controller.js';
import {
  FormDependencyController,
  type DependencyFieldBinding,
  type DependencyPatchApplication,
} from './form-dependency-controller.js';
import { FormValidationRunner } from './form-validation-runner.js';
import { DefaultFormLayout } from './layout/default-form-layout.js';
import { TemplateFormLayout } from './layout/template-form-layout.js';

import type { FormDependencies } from './form-dependency.js';
import type { FormValidator } from './form-validation.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { BatchEditValidationResult } from '../core/editing/batch-edit-transaction.js';
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { BatchChanges, EditorValues } from '../core/editor-values.js';
import type { FieldConfig } from '../fields/field-config.js';
import type {
  FieldController,
  FieldValidationResult,
} from '../fields/field-controller.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';
import type { FormLayout } from './layout/form-layout.js';

/** DOM-backed logical form for applying common values to multiple records. */
export class BatchEditorFormController<TFormValues extends object> {
  public readonly element: HTMLFormElement;

  private readonly bindingByName = new Map<string, BatchFieldBinding<TFormValues>>();

  private readonly dependencyFieldByName = new Map<
    string,
    DependencyFieldBinding<TFormValues>
  >();

  private readonly lifecycleAbortController = new AbortController();

  private readonly pendingChangeTasks = new Set<Promise<void>>();

  private readonly activeChangeAbortControllers = new Map<string, AbortController>();

  private readonly layout: FormLayout;

  private readonly submissionErrorElement: HTMLDivElement;

  private readonly submissionMessages = new Set<string>();

  private readonly configuredFieldNames: ReadonlySet<string>;

  private readonly invalidMessage: string;

  private readonly fieldValidation: FieldValidationController<TFormValues>;

  private readonly batchValidationMessage: string;

  private dependencyController: FormDependencyController<TFormValues> | undefined;

  private originals: readonly Readonly<object>[];

  private bindings: BatchFieldBinding<TFormValues>[] = [];

  private isDestroyed = false;

  public revision = 0;

  public onMutation: (() => void) | undefined;

  private recordMutation(): void {
    this.revision += 1;
    this.onMutation?.();
  }

  public constructor(
    private readonly fields: readonly FieldConfig<TFormValues>[],
    originals: readonly Readonly<object>[],
    instanceId: string,
    private readonly language: Readonly<AltEditorLiteLanguage>,
    template?: DialogTemplateSource,
    private readonly validateForm?: FormValidator<TFormValues>,
    dependencies?: Readonly<FormDependencies<TFormValues>>,
    onDependencyError?: (sourcePath: string, error: AltEditorLiteError) => void,
  ) {
    this.configuredFieldNames = new Set(fields.map(({ name }) => name));
    this.invalidMessage = language.validation.invalid;
    this.batchValidationMessage = language.batchEdit.validationInvalid;
    this.originals = Object.freeze([...originals]);
    this.element = document.createElement('form');
    this.element.className = 'alteditor-lite-form alteditor-lite-batch-form';
    this.element.id = `${instanceId}-batch-form`;
    this.element.noValidate = true;
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
        const restriction = resolveBatchFieldRestriction(config);
        if (
          restriction === 'disabled-by-config' ||
          restriction === 'unsupported-by-field' ||
          config.type === 'hidden'
        ) {
          continue;
        }
        this.createBinding(config, originals, fieldIndex, instanceId, language);
      }
      if (dependencies !== undefined && Object.keys(dependencies).length > 0) {
        this.dependencyController = new FormDependencyController({
          afterApplyPatch: async (application) => {
            await this.afterDependencyPatch(application);
          },
          applyValue: (_targetPath, dependencyBinding, value) => {
            this.applyDependencyValue(dependencyBinding.config.name, value);
          },
          dependencies,
          fields: this.dependencyFieldByName,
          isSourceAvailable: (sourcePath) => {
            const binding = this.bindingByName.get(sourcePath);
            return binding !== undefined && binding.state.current.status !== 'mixed';
          },
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
            const binding = this.bindingByName.get(sourcePath);
            this.fieldValidation.forgetError(sourcePath);
            if (error === undefined) {
              binding?.controller.clearError();
            } else {
              binding?.controller.showError(error.message);
              onDependencyError?.(sourcePath, error);
            }
            this.renderSubmissionError();
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

  /** Retrieves one public field facade backed by semantic batch state. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.assertActive();
    const binding = this.bindingByName.get(name);
    if (binding === undefined) {
      return null;
    }
    return binding.field as FieldController<FieldPathValue<TFormValues, TPath>>;
  }

  /** Resolves dependencies for fields with an initial common value. */
  public async initializeDependencies(): Promise<void> {
    this.assertActive();
    if (this.dependencyController === undefined) {
      return;
    }
    await this.dependencyController.initialize(this.collectLogicalValues());
    await this.waitForChanges();
  }

  /** Collects only fields with an explicit common override. */
  public async collectChanges(): Promise<{
    readonly changes: Readonly<BatchChanges<TFormValues>>;
    readonly changedFields: readonly FieldPath<TFormValues>[];
    readonly collectedFieldValues: ReadonlyMap<string, unknown>;
  }> {
    this.assertActive();
    await this.waitForChanges();
    const changes: Record<string, unknown> = {};
    const changedFields: FieldPath<TFormValues>[] = [];
    const collectedFieldValues = new Map<string, unknown>();
    for (const binding of this.bindings) {
      if (binding.state.current.status !== 'overridden') {
        continue;
      }
      if (binding.restriction !== undefined) {
        throw new EditorConfigurationError(
          binding.restriction === 'file'
            ? this.language.batchEdit.fileRestriction
            : this.language.batchEdit.uniqueRestriction,
        );
      }
      const fieldName = binding.config.name;
      setPathValue(changes, fieldName, binding.state.current.value);
      changedFields.push(fieldName);
      collectedFieldValues.set(fieldName, binding.state.current.value);
    }
    return {
      changedFields: Object.freeze(changedFields),
      changes: freezeEditorValues(changes as BatchChanges<TFormValues>),
      collectedFieldValues,
    };
  }

  /** Validates every overridden field and returns the exact common changes. */
  public async validateForSubmission(
    operationSignal: AbortSignal,
  ): Promise<Readonly<BatchEditValidationResult<TFormValues>>> {
    this.assertActive();
    const resumeFieldValidation = this.fieldValidation.suspend();
    const mergedSignal = mergeAbortSignals([
      operationSignal,
      this.lifecycleAbortController.signal,
    ]);
    const { signal } = mergedSignal;
    try {
      await this.waitForChanges();
      signal.throwIfAborted();
      this.clearErrors();
      const dependencyErrors =
        this.dependencyController?.errors() ?? new Map<string, AltEditorLiteError>();
      if (dependencyErrors.size > 0) {
        const fieldErrors: Record<string, string> = {};
        for (const [sourcePath, error] of dependencyErrors) {
          fieldErrors[sourcePath] = error.message;
        }
        const error = new AltEditorLiteError({
          code: 'VALIDATION',
          fieldErrors,
          message: this.invalidMessage,
          retryable: true,
        });
        this.showSubmissionError(error);
        return { error, valid: false };
      }
      const collected = await this.collectChanges();
      const fieldMessages = new Map<string, Set<string>>();
      const addFieldMessage = (fieldName: string, message: string): void => {
        let messages = fieldMessages.get(fieldName);
        if (messages === undefined) {
          messages = new Set<string>();
          fieldMessages.set(fieldName, messages);
        }
        messages.add(message);
      };
      const logicalValues = this.collectLogicalValues();
      for (const binding of this.bindings) {
        if (binding.state.current.status !== 'overridden') {
          continue;
        }
        const validation = await this.validateBinding(binding, signal, logicalValues);
        if (!validation.valid) {
          addFieldMessage(binding.config.name, validation.message ?? this.invalidMessage);
        }
      }
      signal.throwIfAborted();
      const generalMessages = new Set<string>();
      const formValidator = this.validateForm;
      if (formValidator !== undefined) {
        for (const original of this.originals) {
          const effectiveValues = buildBatchEffectiveValues(
            original,
            collected.changes,
            collected.changedFields,
            this.fields,
          );
          const result = await new FormValidationRunner<TFormValues>({
            allowedFieldNames: this.configuredFieldNames,
            collectValues: () => effectiveValues,
            controllers: [],
            invalidMessage: this.batchValidationMessage,
            validateForm: async (values, currentSignal) =>
              await Promise.resolve(
                formValidator(
                  values,
                  Object.freeze({
                    mode: 'dialog',
                    operation: 'batchEdit',
                    signal: currentSignal,
                  }),
                ),
              ),
          }).run(signal);
          if (!result.valid) {
            for (const [fieldName, message] of Object.entries(
              result.error.fieldErrors ?? {},
            )) {
              addFieldMessage(fieldName, message);
            }
            if (result.message !== undefined) {
              generalMessages.add(result.message);
            }
          }
        }
      }
      signal.throwIfAborted();
      const fieldErrors = Object.fromEntries(
        [...fieldMessages].map(([fieldName, messages]) => [
          fieldName,
          [...messages].join(' '),
        ]),
      );
      if (fieldMessages.size > 0 || generalMessages.size > 0) {
        const firstFieldMessage = Object.values(fieldErrors)[0];
        const error = new AltEditorLiteError({
          code: 'VALIDATION',
          ...(fieldMessages.size === 0 ? {} : { fieldErrors }),
          message:
            [...generalMessages][0] ?? firstFieldMessage ?? this.batchValidationMessage,
          retryable: true,
        });
        for (const message of generalMessages) {
          this.submissionMessages.add(message);
        }
        this.showSubmissionError(error);
        return { error, valid: false };
      }
      return { ...collected, valid: true };
    } finally {
      resumeFieldValidation();
      mergedSignal.dispose();
    }
  }

  /** Rebuilds baselines from newly committed canonical rows. */
  public rebase(originals: readonly Readonly<object>[]): void {
    this.assertActive();
    this.originals = Object.freeze([...originals]);
    for (const binding of this.bindings) {
      binding.rebase(originals);
    }
    this.clearErrors();
  }

  /** Reports whether any batch field differs from its current baseline. */
  public async isDirty(): Promise<boolean> {
    this.assertActive();
    await this.waitForChanges();
    return this.bindings.some(({ state }) => state.current.status === 'overridden');
  }

  /** Updates the form busy state. */
  public setBusy(isBusy: boolean): void {
    this.assertActive();
    this.element.inert = isBusy;
    this.element.setAttribute('aria-busy', String(isBusy));
  }

  /** Displays operation errors through field and form presentation. */
  public showSubmissionError(error: AltEditorLiteError): void {
    this.assertActive();
    for (const [fieldName, message] of Object.entries(error.fieldErrors ?? {})) {
      const binding = this.bindingByName.get(fieldName);
      if (binding === undefined) {
        this.submissionMessages.add(message);
      } else {
        this.fieldValidation.forgetError(fieldName);
        binding.controller.showError(message);
      }
    }
    this.submissionMessages.add(error.message);
    this.renderSubmissionError();
  }

  /** Clears field and form errors. */
  public clearErrors(): void {
    this.assertActive();
    for (const binding of this.bindings) {
      this.fieldValidation.forgetError(binding.config.name);
      binding.controller.clearError();
    }
    this.submissionMessages.clear();
    for (const [sourcePath, error] of this.dependencyController?.errors() ?? []) {
      this.bindingByName.get(sourcePath)?.controller.showError(error.message);
    }
    this.renderSubmissionError();
  }

  /** Removes owned callbacks, controllers, and DOM. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.lifecycleAbortController.abort();
    this.fieldValidation.destroy();
    for (const abortController of this.activeChangeAbortControllers.values()) {
      abortController.abort();
    }
    this.activeChangeAbortControllers.clear();
    this.pendingChangeTasks.clear();
    const dependencyController = this.dependencyController;
    this.dependencyController = undefined;
    const bindings = this.bindings;
    this.bindings = [];
    this.bindingByName.clear();
    this.dependencyFieldByName.clear();
    runCleanupSteps([
      () => {
        dependencyController?.destroy();
      },
      ...bindings.map((binding) => () => {
        binding.destroy();
      }),
      () => {
        this.layout.destroy();
      },
      () => {
        this.element.remove();
      },
    ]);
  }

  private createBinding(
    config: BatchFieldConfig<TFormValues>,
    originals: readonly Readonly<object>[],
    fieldIndex: number,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ): void {
    const binding = new BatchFieldBinding({
      config,
      fieldId: `${instanceId}-batch-field-${String(fieldIndex)}`,
      language,
      lifecycleSignal: this.lifecycleAbortController.signal,
      mount: (element) => this.layout.mountField(config.name, element),
      onDestroyRequest: (currentBinding) => {
        this.destroyBinding(currentBinding);
      },
      onValueChange: () => {
        this.fieldValidation.invalidate(config.name, true);
        this.recordMutation();
      },
      onErrorChange: () => {
        this.fieldValidation.forgetError(config.name);
      },
      onRestore: (currentBinding) => {
        this.queueKnownUserValue(currentBinding);
      },
      onUserValue: (currentBinding) => {
        this.queueUserValue(currentBinding);
      },
      originals,
      validate: async () => await this.fieldValidation.validate(config.name, 'manual'),
    });
    this.bindings.push(binding);
    this.bindingByName.set(config.name, binding);
    this.fieldValidation.register(
      binding.controller,
      config.validateOn,
      async (signal) => {
        await this.waitForChanges();
        signal.throwIfAborted();
        return await this.validateBinding(binding, signal, this.collectLogicalValues());
      },
      () =>
        binding.restriction === undefined &&
        binding.state.current.status === 'overridden',
    );
    this.dependencyFieldByName.set(config.name, {
      config,
      controller: binding.controller,
      runtime: binding.runtime,
    });
  }

  private queueUserValue(binding: BatchFieldBinding<TFormValues>): void {
    this.recordMutation();
    this.fieldValidation.invalidate(binding.config.name, true);
    binding.revision += 1;
    const { revision } = binding;
    this.startUserChange(binding, revision, async (signal) => {
      const value = await Promise.resolve(binding.controller.getValue(signal));
      if (this.isDestroyed || signal.aborted || binding.revision !== revision) {
        return;
      }
      binding.applyUserValue(value);
      await this.runLogicalChange(binding, signal);
    });
  }

  private queueKnownUserValue(binding: BatchFieldBinding<TFormValues>): void {
    const revision = binding.revision;
    this.startUserChange(binding, revision, async (signal) => {
      if (this.isDestroyed || signal.aborted || binding.revision !== revision) {
        return;
      }
      await this.runLogicalChange(binding, signal);
    });
  }

  private startUserChange(
    binding: BatchFieldBinding<TFormValues>,
    revision: number,
    run: (signal: AbortSignal) => Promise<void>,
  ): void {
    this.activeChangeAbortControllers.get(binding.config.name)?.abort();
    const abortController = new AbortController();
    this.activeChangeAbortControllers.set(binding.config.name, abortController);
    const mergedSignal = mergeAbortSignals([
      abortController.signal,
      this.lifecycleAbortController.signal,
    ]);
    const { signal } = mergedSignal;
    const task: Promise<void> = run(signal)
      .catch((error: unknown) => {
        if (this.isDestroyed || signal.aborted || binding.revision !== revision) {
          return;
        }
        const operationError =
          error instanceof AltEditorLiteError
            ? error
            : new AltEditorLiteError({
                cause: error,
                code: 'FIELD_CHANGE',
                message: 'A field change callback failed.',
                retryable: true,
              });
        let hasKnownFieldError = false;
        for (const [fieldName, message] of Object.entries(
          operationError.fieldErrors ?? {},
        )) {
          const errorBinding = this.bindingByName.get(fieldName);
          if (errorBinding !== undefined) {
            this.fieldValidation.forgetError(fieldName);
            errorBinding.controller.showError(message);
            hasKnownFieldError = true;
          }
        }
        if (!hasKnownFieldError) {
          this.fieldValidation.forgetError(binding.config.name);
          binding.controller.showError(operationError.message);
        }
        this.submissionMessages.add(operationError.message);
        this.renderSubmissionError();
      })
      .finally(() => {
        mergedSignal.dispose();
        this.pendingChangeTasks.delete(task);
        if (
          this.activeChangeAbortControllers.get(binding.config.name) === abortController
        ) {
          this.activeChangeAbortControllers.delete(binding.config.name);
        }
      });
    this.pendingChangeTasks.add(task);
  }

  private async runLogicalChange(
    binding: BatchFieldBinding<TFormValues>,
    signal: AbortSignal,
  ): Promise<void> {
    const dependencyValues = this.collectLogicalValues();
    if (this.dependencyController !== undefined) {
      await this.dependencyController.handleUserChange(
        binding.config.name,
        dependencyValues,
        signal,
      );
      signal.throwIfAborted();
    }
    await binding.controller.runOnChange(this.collectLogicalValues(), signal);
  }

  private async waitForChanges(): Promise<void> {
    while (this.pendingChangeTasks.size > 0) {
      await Promise.allSettled([...this.pendingChangeTasks]);
    }
    await this.dependencyController?.waitForCurrent();
  }

  private collectLogicalValues(): Readonly<EditorValues<TFormValues>> {
    const values: Record<string, unknown> = {};
    for (const binding of this.bindings) {
      if (binding.runtime.isDisabled() || binding.state.current.status === 'mixed') {
        continue;
      }
      setPathValue(values, binding.config.name, binding.state.current.value);
    }
    return freezeEditorValues(values as EditorValues<TFormValues>);
  }

  private applyDependencyValue(fieldName: string, value: unknown): void {
    const binding = this.bindingByName.get(fieldName);
    if (binding === undefined) {
      throw new EditorConfigurationError(
        `Dependency target field "${fieldName}" is unavailable.`,
      );
    }
    binding.applyDependencyValue(value);
  }

  private async afterDependencyPatch(
    application: Readonly<DependencyPatchApplication<TFormValues>>,
  ): Promise<void> {
    const binding = this.bindingByName.get(application.targetPath);
    if (binding === undefined) {
      return;
    }
    this.fieldValidation.invalidate(application.targetPath, true);
    if (binding.restriction === 'unique') {
      binding.runtime.setReadOnly(true);
    }
    if (
      application.hasOptions &&
      !application.hasValue &&
      binding.state.current.status !== 'mixed'
    ) {
      const value = await Promise.resolve(
        binding.controller.getValue(this.lifecycleAbortController.signal),
      );
      if (!binding.isEqual(value, binding.state.current.value)) {
        binding.applyDependencyValue(value);
      }
    }
    binding.render();
  }

  private async validateBinding(
    binding: BatchFieldBinding<TFormValues>,
    signal: AbortSignal,
    values: Readonly<EditorValues<TFormValues>> = {} as EditorValues<TFormValues>,
  ): Promise<FieldValidationResult> {
    const { restrictionText } = binding;
    if (restrictionText !== undefined) {
      return { message: restrictionText, valid: false };
    }
    const nativeResult = binding.controller.validateNative();
    if (!nativeResult.valid) {
      return nativeResult;
    }
    const customResult = await binding.controller.validateCustom(values, signal);
    signal.throwIfAborted();
    return customResult;
  }

  private destroyBinding(binding: BatchFieldBinding<TFormValues>): void {
    if (!this.bindingByName.delete(binding.config.name)) {
      return;
    }
    this.recordMutation();
    this.fieldValidation.remove(binding.config.name);
    this.activeChangeAbortControllers.get(binding.config.name)?.abort();
    this.activeChangeAbortControllers.delete(binding.config.name);
    this.dependencyFieldByName.delete(binding.config.name);
    this.dependencyController?.abortSource(binding.config.name);
    this.bindings = this.bindings.filter((candidate) => candidate !== binding);
    binding.destroy();
  }

  private renderSubmissionError(): void {
    const messages = new Set(this.submissionMessages);
    for (const error of this.dependencyController?.errors().values() ?? []) {
      messages.add(error.message);
    }
    this.submissionErrorElement.textContent = [...messages].join(' ');
    this.submissionErrorElement.hidden = messages.size === 0;
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }
}
