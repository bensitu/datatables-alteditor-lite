import {
  AltEditorLiteError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { createFieldController } from '../fields/create-field-controller.js';
import { getPathValue } from '../object-path/get-path-value.js';
import { setPathValue } from '../object-path/set-path-value.js';

import {
  createBatchFieldState,
  restoreBatchFieldValue,
  setBatchFieldValue,
} from './batch-field-state-controller.js';
import { DefaultFormLayout } from './layout/default-form-layout.js';
import { TemplateFormLayout } from './layout/template-form-layout.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { BatchFieldState } from '../core/batch-field-state.js';
import type { BatchEditValidationResult } from '../core/editing/batch-edit-transaction.js';
import type { DialogTemplateSource } from '../core/editing-options.js';
import type { BatchChanges } from '../core/editor-values.js';
import type { FieldConfig, SelectOption } from '../fields/field-config.js';
import type {
  FieldController,
  FieldValidationResult,
} from '../fields/field-controller.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';
import type { FieldMountPoint, FormLayout } from './layout/form-layout.js';

type BatchRestriction = 'file' | 'unique';

interface BatchFieldBinding<TFormValues extends object> {
  readonly config: Readonly<FieldConfig<TFormValues>>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly helperElement: HTMLParagraphElement;
  readonly mountPoint: FieldMountPoint;
  readonly restoreButton: HTMLButtonElement;
  readonly restriction: BatchRestriction | undefined;
  readonly setValueButton: HTMLButtonElement;
  readonly stateElement: HTMLParagraphElement;
  readonly statePanel: HTMLDivElement;
  readonly wrapper: HTMLDivElement;
  isOverrideEditorActive: boolean;
  revision: number;
  state: Readonly<BatchFieldState<unknown>>;
}

const BATCH_TEXT = Object.freeze({
  commonValue: 'Common value',
  fileRestriction: 'File uploads cannot be modified in batch edit.',
  mixedValue: 'Multiple values',
  restore: 'Restore individual values',
  setValue: 'Set a common value',
  uniqueRestriction:
    'Unique fields cannot be assigned one value across multiple records.',
});

function resolveRestriction<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
): BatchRestriction | undefined {
  if (config.type === 'file') {
    return 'file';
  }
  return config.unique === true ? 'unique' : undefined;
}

function emptyControllerValue<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
): unknown {
  switch (config.type) {
    case 'checkbox':
      return false;
    case 'number':
      return config.emptyValue === null ? null : undefined;
    case 'radio':
    case 'search-select':
    case 'select':
      return undefined;
    case 'file':
      return config.multiple === true ? [] : null;
    case 'date':
    case 'datetime-local':
    case 'email':
    case 'hidden':
    case 'password':
    case 'text':
    case 'textarea':
    case 'time':
      return '';
  }
}

/** DOM-backed logical form for applying common values to multiple records. */
export class BatchEditorFormController<TFormValues extends object> {
  public readonly element: HTMLFormElement;

  private readonly bindingByName = new Map<string, BatchFieldBinding<TFormValues>>();

  private readonly fieldControllerByName = new Map<string, FieldController<unknown>>();

  private readonly lifecycleAbortController = new AbortController();

  private readonly pendingChangeTasks = new Set<Promise<void>>();

  private readonly layout: FormLayout;

  private readonly submissionErrorElement: HTMLDivElement;

  private bindings: BatchFieldBinding<TFormValues>[] = [];

  private isDestroyed = false;

  public constructor(
    fields: readonly FieldConfig<TFormValues>[],
    originals: readonly Readonly<object>[],
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
    template?: DialogTemplateSource,
  ) {
    this.element = document.createElement('form');
    this.element.className = 'alteditor-lite-form alteditor-lite-batch-form';
    this.element.id = `${instanceId}-batch-form`;
    this.element.noValidate = true;
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
        if (config.editable === false || config.type === 'hidden') {
          continue;
        }
        this.createBinding(config, originals, fieldIndex, instanceId, language);
      }
    } catch (error: unknown) {
      this.destroy();
      throw error;
    }
  }

  /** Retrieves one public field facade backed by semantic batch state. */
  public getField<TPath extends FieldPath<TFormValues>>(
    name: TPath,
  ): FieldController<FieldPathValue<TFormValues, TPath>> | null {
    this.assertActive();
    const existingController = this.fieldControllerByName.get(name);
    if (existingController !== undefined) {
      return existingController as FieldController<FieldPathValue<TFormValues, TPath>>;
    }
    const binding = this.bindingByName.get(name);
    if (binding === undefined) {
      return null;
    }

    const { controller, mountPoint } = binding;
    const getOptions = controller.getOptions;
    const setOptions = controller.setOptions;
    const publicController: FieldController<unknown> = {
      clearError: () => {
        controller.clearError();
      },
      destroy: () => {
        this.destroyBinding(binding);
      },
      element: controller.element,
      focus: () => {
        controller.focus();
      },
      getValue: async () => await Promise.resolve(controller.getValue()),
      ...(getOptions === undefined || setOptions === undefined
        ? {}
        : {
            getOptions: () => getOptions(),
            setOptions: (options: readonly SelectOption[]) => {
              setOptions(options);
            },
          }),
      isDisabled: () => controller.isDisabled(),
      isReadOnly: () => controller.isReadOnly(),
      isRequired: () => controller.isRequired(),
      isVisible: () => mountPoint.element.hidden === false,
      setDisabled: (isDisabled) => {
        controller.setDisabled(isDisabled);
      },
      setReadOnly: (isReadOnly) => {
        controller.setReadOnly(isReadOnly);
      },
      setRequired: (isRequired) => {
        controller.setRequired(isRequired);
      },
      setValue: (value) => {
        this.setProgrammaticValue(binding, value);
      },
      setVisible: (isVisible) => {
        mountPoint.setVisible(isVisible);
      },
      showError: (message) => {
        controller.showError(message);
      },
      validate: async () =>
        await this.validateBinding(binding, new AbortController().signal),
    };
    this.fieldControllerByName.set(name, publicController);
    return publicController as FieldController<FieldPathValue<TFormValues, TPath>>;
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
    await this.waitForChanges();
    const signal = AbortSignal.any([
      operationSignal,
      this.lifecycleAbortController.signal,
    ]);
    signal.throwIfAborted();
    this.clearErrors();
    const collected = await this.collectChanges();
    const fieldErrors: Record<string, string> = {};
    for (const binding of this.bindings) {
      if (binding.state.current.status !== 'overridden') {
        continue;
      }
      const validation = await this.validateBinding(binding, signal, collected.changes);
      if (!validation.valid) {
        fieldErrors[binding.config.name] = validation.message ?? 'Enter a valid value.';
      }
    }
    signal.throwIfAborted();
    if (Object.keys(fieldErrors).length > 0) {
      const error = new AltEditorLiteError({
        code: 'VALIDATION',
        fieldErrors,
        message: 'Review the highlighted fields.',
        retryable: true,
      });
      this.showSubmissionError(error);
      return { error, valid: false };
    }
    return { ...collected, valid: true };
  }

  /** Rebuilds baselines from newly committed canonical rows. */
  public rebase(originals: readonly Readonly<object>[]): void {
    this.assertActive();
    for (const binding of this.bindings) {
      binding.state = createBatchFieldState(
        originals.map((original) => getPathValue(original, binding.config.name)),
      );
      binding.isOverrideEditorActive = binding.state.baseline.status === 'common';
      this.populateCommonValue(binding);
      this.renderBinding(binding);
    }
    this.clearErrors();
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
    const messages = new Set<string>();
    let hasFieldError = false;
    for (const [fieldName, message] of Object.entries(error.fieldErrors ?? {})) {
      const binding = this.bindingByName.get(fieldName);
      if (binding === undefined) {
        messages.add(message);
      } else {
        binding.controller.showError(message);
        hasFieldError = true;
      }
    }
    if (!hasFieldError || messages.size > 0) {
      messages.add(error.message);
    }
    this.submissionErrorElement.textContent = [...messages].join(' ');
    this.submissionErrorElement.hidden = messages.size === 0;
  }

  /** Clears field and form errors. */
  public clearErrors(): void {
    this.assertActive();
    for (const binding of this.bindings) {
      binding.controller.clearError();
    }
    this.submissionErrorElement.textContent = '';
    this.submissionErrorElement.hidden = true;
  }

  /** Removes owned callbacks, controllers, and DOM. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.lifecycleAbortController.abort();
    const bindings = this.bindings;
    this.bindings = [];
    this.bindingByName.clear();
    this.fieldControllerByName.clear();
    runCleanupSteps([
      ...bindings.map((binding) => () => {
        binding.controller.destroy();
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
    config: FieldConfig<TFormValues>,
    originals: readonly Readonly<object>[],
    fieldIndex: number,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'alteditor-lite-batch-field';
    wrapper.dataset['alteditorLiteBatchField'] = config.name;
    const statePanel = document.createElement('div');
    statePanel.className = 'alteditor-lite-batch-field__state';
    const stateElement = document.createElement('p');
    stateElement.className = 'alteditor-lite-batch-field__state-text';
    stateElement.setAttribute('role', 'status');
    const fieldLabel = document.createElement('span');
    fieldLabel.className = 'alteditor-lite-batch-field__label';
    fieldLabel.textContent = config.type === 'hidden' ? config.name : config.label;
    const setValueButton = document.createElement('button');
    setValueButton.className = 'alteditor-lite-batch-field__action';
    setValueButton.type = 'button';
    setValueButton.textContent = BATCH_TEXT.setValue;
    const restoreButton = document.createElement('button');
    restoreButton.className = 'alteditor-lite-batch-field__action';
    restoreButton.type = 'button';
    restoreButton.textContent = BATCH_TEXT.restore;
    const helperElement = document.createElement('p');
    helperElement.className = 'alteditor-lite-field__description';
    statePanel.append(fieldLabel, stateElement, setValueButton);

    const bindingReference: {
      current: BatchFieldBinding<TFormValues> | undefined;
    } = { current: undefined };
    const controller = createFieldController(
      config,
      `${instanceId}-batch-field-${String(fieldIndex)}`,
      language,
      () => {
        if (bindingReference.current !== undefined) {
          this.queueUserValue(bindingReference.current);
        }
      },
    );
    wrapper.append(statePanel, controller.element, restoreButton, helperElement);
    const mountPoint = this.layout.mountField(config.name, wrapper);
    const state = createBatchFieldState(
      originals.map((original) => getPathValue(original, config.name)),
    );
    const restriction = resolveRestriction(config);
    const binding: BatchFieldBinding<TFormValues> = {
      config,
      controller,
      helperElement,
      isOverrideEditorActive: state.baseline.status === 'common',
      mountPoint,
      restoreButton,
      restriction,
      revision: 0,
      setValueButton,
      state,
      stateElement,
      statePanel,
      wrapper,
    };
    bindingReference.current = binding;
    this.bindings.push(binding);
    this.bindingByName.set(config.name, binding);
    controller.setDisabled(config.disabled === true);
    controller.setReadOnly(
      restriction === 'unique' ||
        ('readOnly' in config ? (config.readOnly ?? false) : false),
    );
    controller.setRequired('required' in config ? (config.required ?? false) : false);
    mountPoint.setVisible(config.visible !== false);
    this.populateCommonValue(binding);
    this.renderBinding(binding);
    setValueButton.addEventListener('click', () => {
      this.activateOverrideEditor(binding);
    });
    restoreButton.addEventListener('click', () => {
      this.restoreBinding(binding);
    });
  }

  private populateCommonValue(binding: BatchFieldBinding<TFormValues>): void {
    if (binding.state.baseline.status !== 'common' || binding.restriction === 'file') {
      return;
    }
    binding.controller.setValue(
      binding.state.baseline.value ?? emptyControllerValue(binding.config),
    );
  }

  private renderBinding(binding: BatchFieldBinding<TFormValues>): void {
    const { current } = binding.state;
    const isMixed = current.status === 'mixed';
    binding.stateElement.textContent = isMixed
      ? BATCH_TEXT.mixedValue
      : BATCH_TEXT.commonValue;
    binding.statePanel.hidden = !isMixed && binding.restriction !== 'file';
    binding.setValueButton.hidden =
      binding.restriction !== undefined || binding.isOverrideEditorActive;
    binding.controller.element.hidden =
      binding.restriction === 'file' ||
      (isMixed && !binding.isOverrideEditorActive) ||
      (binding.restriction === 'unique' && isMixed);
    binding.restoreButton.hidden = current.status !== 'overridden';
    binding.helperElement.textContent =
      binding.restriction === 'file'
        ? BATCH_TEXT.fileRestriction
        : binding.restriction === 'unique'
          ? BATCH_TEXT.uniqueRestriction
          : '';
    binding.helperElement.hidden = binding.restriction === undefined;
  }

  private activateOverrideEditor(binding: BatchFieldBinding<TFormValues>): void {
    if (binding.restriction !== undefined || binding.controller.isDisabled()) {
      return;
    }
    binding.isOverrideEditorActive = true;
    this.renderBinding(binding);
    binding.controller.focus();
  }

  private restoreBinding(binding: BatchFieldBinding<TFormValues>): void {
    binding.revision += 1;
    binding.state = restoreBatchFieldValue(binding.state);
    binding.isOverrideEditorActive = binding.state.baseline.status === 'common';
    this.populateCommonValue(binding);
    binding.controller.clearError();
    this.renderBinding(binding);
    if (binding.state.baseline.status === 'mixed') {
      binding.setValueButton.focus();
    } else {
      binding.controller.focus();
    }
  }

  private setProgrammaticValue(
    binding: BatchFieldBinding<TFormValues>,
    value: unknown,
  ): void {
    if (binding.restriction !== undefined) {
      binding.controller.showError(
        binding.restriction === 'file'
          ? BATCH_TEXT.fileRestriction
          : BATCH_TEXT.uniqueRestriction,
      );
      return;
    }
    if (binding.controller.isDisabled()) {
      return;
    }
    binding.controller.setValue(value);
    binding.state = setBatchFieldValue(binding.state, value);
    binding.isOverrideEditorActive = true;
    this.renderBinding(binding);
  }

  private queueUserValue(binding: BatchFieldBinding<TFormValues>): void {
    binding.revision += 1;
    const revision = binding.revision;
    const task: Promise<void> = Promise.resolve(
      binding.controller.getValue(this.lifecycleAbortController.signal),
    )
      .then((value) => {
        if (
          this.isDestroyed ||
          this.lifecycleAbortController.signal.aborted ||
          binding.revision !== revision
        ) {
          return;
        }
        binding.state = setBatchFieldValue(binding.state, value);
        binding.isOverrideEditorActive = true;
        binding.controller.clearError();
        this.renderBinding(binding);
      })
      .catch(() => undefined)
      .finally(() => {
        this.pendingChangeTasks.delete(task);
      });
    this.pendingChangeTasks.add(task);
  }

  private async waitForChanges(): Promise<void> {
    while (this.pendingChangeTasks.size > 0) {
      await Promise.all([...this.pendingChangeTasks]);
    }
  }

  private async validateBinding(
    binding: BatchFieldBinding<TFormValues>,
    signal: AbortSignal,
    values: Readonly<BatchChanges<TFormValues>> = {} as BatchChanges<TFormValues>,
  ): Promise<FieldValidationResult> {
    if (binding.restriction !== undefined) {
      const message =
        binding.restriction === 'file'
          ? BATCH_TEXT.fileRestriction
          : BATCH_TEXT.uniqueRestriction;
      binding.controller.showError(message);
      return { message, valid: false } as const;
    }
    const nativeResult = binding.controller.validateNative();
    if (!nativeResult.valid) {
      binding.controller.showError(nativeResult.message ?? 'Enter a valid value.');
      return nativeResult;
    }
    const customResult = await binding.controller.validateCustom(values, signal);
    if (!customResult.valid) {
      binding.controller.showError(customResult.message ?? 'Enter a valid value.');
    }
    return customResult;
  }

  private destroyBinding(binding: BatchFieldBinding<TFormValues>): void {
    if (!this.bindingByName.delete(binding.config.name)) {
      return;
    }
    binding.revision += 1;
    binding.controller.destroy();
    binding.mountPoint.setVisible(false);
    this.fieldControllerByName.delete(binding.config.name);
    this.bindings = this.bindings.filter((candidate) => candidate !== binding);
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }
}
