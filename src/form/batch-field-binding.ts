import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { createFieldController } from '../fields/create-field-controller.js';
import {
  resolveBatchFieldRestriction,
  type FieldBatchRestriction,
} from '../fields/field-capabilities.js';
import { BATCH_FIELD_PRESENTATION } from '../fields/field-controller-presentation.js';
import { resolveFieldValueComparator } from '../fields/field-value-comparator.js';
import { getPathValue } from '../object-path/get-path-value.js';

import { BatchFieldPresentation } from './batch-field-presentation.js';
import {
  createBatchFieldState,
  restoreBatchFieldValue,
  setBatchFieldValue,
} from './batch-field-state-updates.js';
import { FieldRuntimeController } from './field-runtime-controller.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { BatchFieldState } from '../core/batch-field-state.js';
import type { FieldConfig, SelectOption } from '../fields/field-config.js';
import type {
  FieldController,
  FieldValidationResult,
} from '../fields/field-controller.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldMountPoint } from './layout/form-layout.js';

export type BatchFieldConfig<TFormValues extends object> = Exclude<
  FieldConfig<TFormValues>,
  { readonly type: 'hidden' }
>;

export type DisplayedBatchRestriction = Extract<FieldBatchRestriction, 'file' | 'unique'>;

export interface BatchFieldBindingArguments<TFormValues extends object> {
  readonly config: BatchFieldConfig<TFormValues>;
  readonly fieldId: string;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly lifecycleSignal: AbortSignal;
  readonly mount: (element: HTMLElement) => FieldMountPoint;
  readonly onDestroyRequest: (binding: BatchFieldBinding<TFormValues>) => void;
  readonly onRestore: (binding: BatchFieldBinding<TFormValues>) => void;
  readonly onUserValue: (binding: BatchFieldBinding<TFormValues>) => void;
  readonly originals: readonly Readonly<object>[];
  readonly validate: (
    binding: BatchFieldBinding<TFormValues>,
  ) => Promise<FieldValidationResult>;
}

function resolveDisplayedRestriction<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
): DisplayedBatchRestriction | undefined {
  const restriction = resolveBatchFieldRestriction(config);
  return restriction === 'file' || restriction === 'unique' ? restriction : undefined;
}

function emptyControllerValue<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
): unknown {
  switch (config.type) {
    case 'checkbox':
      return false;
    case 'custom':
      return config.defaultValue;
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

/** Coordinates semantic state and runtime resources for one batch field. */
export class BatchFieldBinding<TFormValues extends object> {
  public readonly config: Readonly<BatchFieldConfig<TFormValues>>;

  public readonly controller: ManagedFieldController<TFormValues>;

  public readonly isEqual: (left: unknown, right: unknown) => boolean;

  public readonly field: FieldController<unknown>;

  public readonly restriction: DisplayedBatchRestriction | undefined;

  public readonly restrictionText: string | undefined;

  public readonly runtime: FieldRuntimeController<TFormValues>;

  #mountPoint: FieldMountPoint;

  #presentation: BatchFieldPresentation;

  #isDestroyed = false;

  #isOverrideEditorActive: boolean;

  public revision = 0;

  public state: Readonly<BatchFieldState<unknown>>;

  public constructor(configuration: BatchFieldBindingArguments<TFormValues>) {
    const { config } = configuration;
    let controller: ManagedFieldController<TFormValues> | undefined;
    let presentation: BatchFieldPresentation | undefined;
    try {
      controller = createFieldController(
        config,
        configuration.fieldId,
        configuration.language,
        () => {
          configuration.onUserValue(this);
        },
        BATCH_FIELD_PRESENTATION,
        configuration.lifecycleSignal,
      );
      presentation = new BatchFieldPresentation({
        fieldElement: controller.element,
        fieldLabel: config.label,
        fieldName: config.name,
        focusField: () => {
          this.controller.focus();
        },
        language: configuration.language,
        onRestore: () => {
          this.#restore();
          configuration.onRestore(this);
        },
        onSetCommonValue: () => {
          this.#activateOverrideEditor();
        },
      });
      const mountPoint = configuration.mount(presentation.element);
      const restriction = resolveDisplayedRestriction(config);
      const runtime = new FieldRuntimeController({
        config,
        controller,
        disabled: config.disabled ?? false,
        mountPoint,
        readOnly:
          restriction === 'unique' ||
          ('readOnly' in config ? (config.readOnly ?? false) : false),
        required: 'required' in config ? (config.required ?? false) : false,
        visible: config.visible !== false,
      });
      const isEqual = resolveFieldValueComparator(config);
      const state = createBatchFieldState(
        configuration.originals.map((original) => getPathValue(original, config.name)),
        isEqual,
      );

      this.config = config;
      this.controller = controller;
      this.isEqual = isEqual;
      this.#isOverrideEditorActive = state.baseline.status === 'common';
      this.#mountPoint = mountPoint;
      this.#presentation = presentation;
      this.restriction = restriction;
      this.restrictionText =
        restriction === 'file'
          ? configuration.language.batchEdit.fileRestriction
          : restriction === 'unique'
            ? configuration.language.batchEdit.uniqueRestriction
            : undefined;
      this.runtime = runtime;
      this.state = state;
      const getOptions = this.controller.getOptions;
      const setOptions = this.controller.setOptions;
      this.field = {
        clearError: () => {
          this.controller.clearError();
        },
        destroy: () => {
          configuration.onDestroyRequest(this);
        },
        element: this.controller.element,
        focus: () => {
          this.controller.focus();
        },
        getValue: async () => await Promise.resolve(this.controller.getValue()),
        ...(getOptions === undefined || setOptions === undefined
          ? {}
          : {
              getOptions: () => getOptions(),
              setOptions: (options: readonly SelectOption[]) => {
                setOptions(options);
              },
            }),
        isDisabled: () => runtime.isDisabled(),
        isReadOnly: () => runtime.isReadOnly(),
        isRequired: () => runtime.isRequired(),
        isVisible: () => runtime.isVisible(),
        setDisabled: (isDisabled) => {
          runtime.setDisabled(isDisabled);
          this.render();
        },
        setReadOnly: (isReadOnly) => {
          runtime.setReadOnly(restriction === 'unique' || isReadOnly);
        },
        setRequired: (isRequired) => {
          runtime.setRequired(isRequired);
        },
        setValue: (value) => {
          this.#setProgrammaticValue(value);
        },
        setVisible: (isVisible) => {
          runtime.setVisible(isVisible);
        },
        showError: (message) => {
          this.controller.showError(message);
        },
        validate: async () => await configuration.validate(this),
      };

      runtime.setDisabled(runtime.isDisabled());
      runtime.setReadOnly(runtime.isReadOnly());
      runtime.setRequired(runtime.isRequired());
      runtime.setVisible(runtime.isVisible());
      this.#populateCommonValue();
      this.render();
    } catch (error: unknown) {
      try {
        runCleanupSteps([
          () => {
            controller?.destroy();
          },
          () => {
            presentation?.destroy();
          },
        ]);
      } catch {
        // Continue returning the initialization failure.
      }
      throw error;
    }
  }

  public applyDependencyValue(value: unknown): void {
    if (this.restrictionText !== undefined) {
      throw new EditorConfigurationError(this.restrictionText);
    }
    this.controller.setValue(value);
    this.#applyValue(value);
  }

  public applyUserValue(value: unknown): void {
    this.#applyValue(value);
    this.controller.clearError();
  }

  public rebase(originals: readonly Readonly<object>[]): void {
    this.state = createBatchFieldState(
      originals.map((original) => getPathValue(original, this.config.name)),
      this.isEqual,
    );
    this.#isOverrideEditorActive = this.state.baseline.status === 'common';
    this.#populateCommonValue();
    this.render();
  }

  #setProgrammaticValue(value: unknown): void {
    if (this.restrictionText !== undefined) {
      this.controller.showError(this.restrictionText);
      return;
    }
    if (this.controller.isDisabled()) {
      return;
    }
    this.controller.setValue(value);
    this.#applyValue(value);
  }

  public destroy(): void {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;
    this.revision += 1;
    this.#mountPoint.setVisible(false);
    runCleanupSteps([
      () => {
        this.controller.destroy();
      },
      () => {
        this.#presentation.destroy();
      },
    ]);
  }

  #activateOverrideEditor(): void {
    if (this.restriction !== undefined || this.controller.isDisabled()) {
      return;
    }
    this.#isOverrideEditorActive = true;
    this.render();
    this.#presentation.focus('field');
  }

  #applyValue(value: unknown): void {
    this.state = setBatchFieldValue(this.state, value, this.isEqual);
    this.#isOverrideEditorActive = true;
    this.render();
  }

  #populateCommonValue(): void {
    if (this.state.baseline.status !== 'common' || this.restriction === 'file') {
      return;
    }
    this.controller.setValue(
      this.state.baseline.value ?? emptyControllerValue(this.config),
    );
  }

  public render(): void {
    this.#presentation.render({
      currentStatus: this.state.current.status,
      disabled: this.runtime.isDisabled(),
      overrideEditorActive: this.#isOverrideEditorActive,
      ...(this.restriction === undefined ? {} : { restriction: this.restriction }),
    });
  }

  #restore(): void {
    this.revision += 1;
    this.state = restoreBatchFieldValue(this.state);
    this.#isOverrideEditorActive = this.state.baseline.status === 'common';
    this.#populateCommonValue();
    this.controller.clearError();
    this.render();
    this.#presentation.focus(
      this.state.baseline.status === 'mixed' ? 'setValue' : 'field',
    );
  }
}
