import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { hasOwn } from '../core/has-own.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { ChoiceOptionStore } from '../fields/choice-option-store.js';
import { parseFieldPath } from '../object-path/field-path.js';
import { getPathValue } from '../object-path/get-path-value.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from '../search-select/search-select.js';

import type { FieldRuntimeController } from './field-runtime-controller.js';
import type {
  FormDependencies,
  FormDependencyResolver,
  FormDependencyResult,
} from './form-dependency.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldConfig, SelectOption } from '../fields/field-config.js';
import type { MaybePromise } from '../fields/field-value.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldPath } from '../object-path/field-path.js';

const PATCH_PROPERTIES = new Set([
  'disabled',
  'options',
  'readOnly',
  'required',
  'value',
  'visible',
]);

/** Configured resources required to validate and apply one field patch. */
export interface DependencyFieldBinding<TFormValues extends object> {
  readonly config: Readonly<FieldConfig<TFormValues>>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly runtime: FieldRuntimeController<TFormValues>;
}

export interface FormDependencyControllerArguments<TFormValues extends object> {
  readonly dependencies: Readonly<FormDependencies<TFormValues>>;
  readonly fields: ReadonlyMap<string, DependencyFieldBinding<TFormValues>>;
  readonly lifecycleSignal: AbortSignal;
  readonly normalizeError: (error: unknown) => AltEditorLiteError;
  readonly onErrorChange: (
    sourcePath: string,
    error: AltEditorLiteError | undefined,
  ) => void;
  readonly isSourceAvailable?: (sourcePath: string) => boolean;
  readonly applyValue?: (
    targetPath: string,
    binding: DependencyFieldBinding<TFormValues>,
    value: unknown,
  ) => MaybePromise<void>;
  readonly afterApplyPatch?: (
    application: Readonly<DependencyPatchApplication<TFormValues>>,
  ) => MaybePromise<void>;
}

/** Information exposed after one validated dependency patch is applied. */
export interface DependencyPatchApplication<TFormValues extends object> {
  readonly binding: DependencyFieldBinding<TFormValues>;
  readonly targetPath: string;
  readonly hasOptions: boolean;
  readonly hasValue: boolean;
}

interface ActiveDependencyRequest {
  readonly abortController: AbortController;
  readonly revision: number;
}

type DependencyResolution<TFormValues extends object> =
  | {
      readonly result: FormDependencyResult<TFormValues>;
      readonly revision: number;
      readonly sourcePath: string;
      readonly status: 'resolved';
    }
  | { readonly status: 'failed' | 'stale' };

interface ValidatedFieldPatch<TFormValues extends object> {
  readonly binding: DependencyFieldBinding<TFormValues>;
  readonly targetPath: string;
  readonly hasDisabled: boolean;
  readonly disabled?: boolean;
  readonly hasOptions: boolean;
  readonly options?: readonly SelectOption[];
  readonly hasReadOnly: boolean;
  readonly readOnly?: boolean;
  readonly hasRequired: boolean;
  readonly required?: boolean;
  readonly hasValue: boolean;
  readonly value?: unknown;
  readonly hasVisible: boolean;
  readonly visible?: boolean;
}

function isAbortError(error: unknown): boolean {
  try {
    return (
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'name') === 'AbortError'
    );
  } catch {
    return false;
  }
}

function settleOnAbort<TValue>(
  value: PromiseLike<TValue> | TValue,
  signal: AbortSignal,
): Promise<TValue> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  }
  return new Promise<TValue>((resolve, reject) => {
    const settlement: {
      handleAbort: (() => void) | undefined;
      reject: ((reason?: unknown) => void) | undefined;
      resolve: ((result: TValue) => void) | undefined;
      signal: AbortSignal | undefined;
    } = { handleAbort: undefined, reject, resolve, signal };
    const release = (): void => {
      const currentSignal = settlement.signal;
      const currentHandleAbort = settlement.handleAbort;
      settlement.handleAbort = undefined;
      settlement.reject = undefined;
      settlement.resolve = undefined;
      settlement.signal = undefined;
      if (currentHandleAbort !== undefined) {
        currentSignal?.removeEventListener('abort', currentHandleAbort);
      }
    };
    const resolveValue = (result: TValue): void => {
      const currentResolve = settlement.resolve;
      if (currentResolve === undefined) {
        return;
      }
      release();
      currentResolve(result);
    };
    const rejectValue = (error: unknown): void => {
      const currentReject = settlement.reject;
      if (currentReject === undefined) {
        return;
      }
      release();
      currentReject(error);
    };
    const handleAbort = (): void => {
      rejectValue(new DOMException('The request was aborted.', 'AbortError'));
    };
    settlement.handleAbort = handleAbort;
    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve(value).then(resolveValue, (error: unknown) => {
      rejectValue(
        error instanceof Error ? error : new Error('Resolver failed.', { cause: error }),
      );
    });
  });
}

function isObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOptionValue(options: readonly SelectOption[], value: unknown): boolean {
  return options.some((option) => Object.is(option.value, value));
}

function assertCompatibleValue<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
  value: unknown,
  options: readonly SelectOption[],
): void {
  let isValid = false;
  switch (config.type) {
    case 'checkbox': {
      isValid = typeof value === 'boolean';
      break;
    }
    case 'custom': {
      isValid = true;
      break;
    }
    case 'number': {
      isValid =
        (typeof value === 'number' && Number.isFinite(value)) ||
        (config.emptyValue === null ? value === null : value === undefined);
      break;
    }
    case 'radio':
    case 'select': {
      isValid = value === undefined || hasOptionValue(options, value);
      break;
    }
    case 'search-select': {
      isValid =
        value === undefined ||
        (config.remote !== undefined &&
          (typeof value === 'string' || typeof value === 'number')) ||
        hasOptionValue(options, value) ||
        (config.allowManualValue === true && typeof value === 'string');
      break;
    }
    case 'file': {
      isValid =
        config.multiple === true
          ? Array.isArray(value) && value.length === 0
          : value === null;
      break;
    }
    case 'date':
    case 'datetime-local':
    case 'email':
    case 'hidden':
    case 'password':
    case 'text':
    case 'textarea':
    case 'time': {
      isValid = typeof value === 'string';
      break;
    }
  }

  if (!isValid) {
    throw new EditorConfigurationError(
      `Dependency value for field "${config.name}" is not valid for a ${config.type} field.`,
    );
  }
}

/** Resolves, validates, and applies declarative field state. */
export class FormDependencyController<TFormValues extends object> {
  private readonly resolverBySource = new Map<
    string,
    FormDependencyResolver<TFormValues, FieldPath<TFormValues>>
  >();

  private readonly activeRequestBySource = new Map<string, ActiveDependencyRequest>();

  private readonly pendingBySource = new Map<string, Promise<void>>();

  private readonly revisionBySource = new Map<string, number>();

  private readonly latestErrorBySource = new Map<string, AltEditorLiteError>();

  private isDestroyed = false;

  public constructor(
    private readonly arguments_: FormDependencyControllerArguments<TFormValues>,
  ) {
    for (const [sourcePath, resolver] of Object.entries(arguments_.dependencies)) {
      if (resolver !== undefined) {
        this.resolverBySource.set(
          sourcePath,
          resolver as FormDependencyResolver<TFormValues, FieldPath<TFormValues>>,
        );
      }
    }
  }

  /** Resolves every source against one shared initial values snapshot. */
  public async initialize(values: Readonly<EditorValues<TFormValues>>): Promise<void> {
    const resolutions = await Promise.all(
      [...this.resolverBySource.keys()]
        .filter((sourcePath) => this.arguments_.isSourceAvailable?.(sourcePath) !== false)
        .map(async (sourcePath) => await this.startResolution(sourcePath, values)),
    );
    if (this.isDestroyed || this.arguments_.lifecycleSignal.aborted) {
      return;
    }

    const resolved = resolutions.filter(
      (
        resolution,
      ): resolution is Extract<
        DependencyResolution<TFormValues>,
        { readonly status: 'resolved' }
      > => resolution.status === 'resolved',
    );
    if (resolved.length === 0) {
      return;
    }

    const mergedResult = this.mergeInitialResults(resolved.map(({ result }) => result));
    const patches = this.validateResult(mergedResult);
    await this.applyPatches(patches);
    for (const resolution of resolved) {
      if (this.isCurrent(resolution.sourcePath, resolution.revision)) {
        this.clearError(resolution.sourcePath);
      }
    }
  }

  /** Resolves and applies the dependency associated with one user-edited source. */
  public async handleUserChange(
    sourcePath: string,
    values: Readonly<EditorValues<TFormValues>>,
    parentSignal: AbortSignal,
  ): Promise<void> {
    if (!this.resolverBySource.has(sourcePath)) {
      return;
    }
    if (this.arguments_.isSourceAvailable?.(sourcePath) === false) {
      this.abortSource(sourcePath);
      return;
    }
    const resolution = await this.startResolution(sourcePath, values, parentSignal);
    if (resolution.status !== 'resolved') {
      return;
    }
    try {
      const patches = this.validateResult(resolution.result);
      if (!this.isCurrent(sourcePath, resolution.revision)) {
        return;
      }
      await this.applyPatches(patches);
      this.clearError(sourcePath);
    } catch (error: unknown) {
      if (this.isCurrent(sourcePath, resolution.revision)) {
        this.recordError(sourcePath, this.arguments_.normalizeError(error));
      }
    }
  }

  /** Waits only for currently owned resolver requests. */
  public async waitForCurrent(): Promise<void> {
    while (this.pendingBySource.size > 0) {
      await Promise.allSettled([...this.pendingBySource.values()]);
    }
  }

  public errors(): ReadonlyMap<string, AltEditorLiteError> {
    return new Map(this.latestErrorBySource);
  }

  public abortSource(sourcePath: string): void {
    this.activeRequestBySource.get(sourcePath)?.abortController.abort();
    this.activeRequestBySource.delete(sourcePath);
    this.pendingBySource.delete(sourcePath);
    this.revisionBySource.set(
      sourcePath,
      (this.revisionBySource.get(sourcePath) ?? 0) + 1,
    );
    this.clearError(sourcePath);
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    for (const request of this.activeRequestBySource.values()) {
      request.abortController.abort();
    }
    this.activeRequestBySource.clear();
    this.pendingBySource.clear();
    this.latestErrorBySource.clear();
  }

  private startResolution(
    sourcePath: string,
    values: Readonly<EditorValues<TFormValues>>,
    parentSignal?: AbortSignal,
  ): Promise<DependencyResolution<TFormValues>> {
    const resolver = this.resolverBySource.get(sourcePath);
    if (resolver === undefined) {
      return Promise.resolve({ status: 'stale' });
    }

    this.activeRequestBySource.get(sourcePath)?.abortController.abort();
    const revision = (this.revisionBySource.get(sourcePath) ?? 0) + 1;
    this.revisionBySource.set(sourcePath, revision);
    const abortController = new AbortController();
    const request = { abortController, revision };
    this.activeRequestBySource.set(sourcePath, request);
    const signal = mergeAbortSignals([
      abortController.signal,
      this.arguments_.lifecycleSignal,
      ...(parentSignal === undefined ? [] : [parentSignal]),
    ]);

    const resolutionPromise = this.invokeResolver(
      sourcePath,
      resolver,
      values,
      signal,
      revision,
    );
    const completionPromise = resolutionPromise
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (this.activeRequestBySource.get(sourcePath) === request) {
          this.activeRequestBySource.delete(sourcePath);
        }
        if (this.pendingBySource.get(sourcePath) === completionPromise) {
          this.pendingBySource.delete(sourcePath);
        }
      });
    this.pendingBySource.set(sourcePath, completionPromise);
    return resolutionPromise;
  }

  private async invokeResolver(
    sourcePath: string,
    resolver: FormDependencyResolver<TFormValues, FieldPath<TFormValues>>,
    values: Readonly<EditorValues<TFormValues>>,
    signal: AbortSignal,
    revision: number,
  ): Promise<DependencyResolution<TFormValues>> {
    try {
      const result = await settleOnAbort(
        resolver(
          getPathValue(values, sourcePath) as never,
          Object.freeze({ signal, values }),
        ),
        signal,
      );
      if (!this.isCurrent(sourcePath, revision) || signal.aborted) {
        return { status: 'stale' };
      }
      return { result, revision, sourcePath, status: 'resolved' };
    } catch (error: unknown) {
      if (
        signal.aborted ||
        isAbortError(error) ||
        !this.isCurrent(sourcePath, revision)
      ) {
        return { status: 'stale' };
      }
      this.recordError(sourcePath, this.arguments_.normalizeError(error));
      return { status: 'failed' };
    }
  }

  private isCurrent(sourcePath: string, revision: number): boolean {
    return (
      !this.isDestroyed &&
      !this.arguments_.lifecycleSignal.aborted &&
      this.revisionBySource.get(sourcePath) === revision
    );
  }

  private mergeInitialResults(
    results: readonly FormDependencyResult<TFormValues>[],
  ): FormDependencyResult<TFormValues> {
    const mergedTargets = new Map<string, Record<string, unknown>>();
    const assignedProperties = new Map<string, unknown>();

    for (const result of results) {
      if (!isObjectRecord(result)) {
        throw new EditorConfigurationError(
          'A dependency resolver must return a field patch object.',
        );
      }
      for (const [targetPath, rawPatch] of Object.entries(result)) {
        if (!isObjectRecord(rawPatch)) {
          throw new EditorConfigurationError(
            `Dependency patch for field "${targetPath}" must be an object.`,
          );
        }
        let mergedPatch = mergedTargets.get(targetPath);
        if (mergedPatch === undefined) {
          mergedPatch = Object.create(null) as Record<string, unknown>;
          mergedTargets.set(targetPath, mergedPatch);
        }
        for (const [propertyName, propertyValue] of Object.entries(rawPatch)) {
          const assignmentKey = `${targetPath}\u0000${propertyName}`;
          if (
            assignedProperties.has(assignmentKey) &&
            !Object.is(assignedProperties.get(assignmentKey), propertyValue)
          ) {
            throw new EditorConfigurationError(
              `Initial dependency resolvers assign conflicting "${propertyName}" values to field "${targetPath}".`,
            );
          }
          assignedProperties.set(assignmentKey, propertyValue);
          mergedPatch[propertyName] = propertyValue;
        }
      }
    }

    const mergedResult = Object.create(null) as Record<string, unknown>;
    for (const [targetPath, patch] of mergedTargets) {
      mergedResult[targetPath] = patch;
    }
    return mergedResult as FormDependencyResult<TFormValues>;
  }

  private validateResult(
    result: FormDependencyResult<TFormValues>,
  ): readonly ValidatedFieldPatch<TFormValues>[] {
    if (!isObjectRecord(result)) {
      throw new EditorConfigurationError(
        'A dependency resolver must return a field patch object.',
      );
    }

    const validatedPatches: ValidatedFieldPatch<TFormValues>[] = [];
    for (const [targetPath, rawPatch] of Object.entries(result)) {
      parseFieldPath(targetPath);
      const binding = this.arguments_.fields.get(targetPath);
      if (binding === undefined) {
        throw new EditorConfigurationError(
          `Dependency target field "${targetPath}" is unavailable.`,
        );
      }
      if (!isObjectRecord(rawPatch)) {
        throw new EditorConfigurationError(
          `Dependency patch for field "${targetPath}" must be an object.`,
        );
      }
      for (const propertyName of Object.keys(rawPatch)) {
        if (!PATCH_PROPERTIES.has(propertyName)) {
          throw new EditorConfigurationError(
            `Dependency patch for field "${targetPath}" contains unsupported property "${propertyName}".`,
          );
        }
      }

      const hasVisible = hasOwn(rawPatch, 'visible');
      const hasDisabled = hasOwn(rawPatch, 'disabled');
      const hasReadOnly = hasOwn(rawPatch, 'readOnly');
      const hasRequired = hasOwn(rawPatch, 'required');
      for (const propertyName of [
        'visible',
        'disabled',
        'readOnly',
        'required',
      ] as const) {
        if (
          hasOwn(rawPatch, propertyName) &&
          typeof rawPatch[propertyName] !== 'boolean'
        ) {
          throw new EditorConfigurationError(
            `Dependency property "${propertyName}" for field "${targetPath}" must be a boolean.`,
          );
        }
      }
      if (
        binding.config.type === 'hidden' &&
        hasVisible &&
        rawPatch['visible'] === true
      ) {
        throw new EditorConfigurationError(
          `Hidden field "${targetPath}" cannot be made visible.`,
        );
      }

      const hasOptions = hasOwn(rawPatch, 'options');
      let options: readonly SelectOption[] | undefined;
      if (hasOptions) {
        if (
          binding.controller.getOptions === undefined ||
          binding.controller.setOptions === undefined
        ) {
          throw new EditorConfigurationError(
            `Dependency options require a choice field target; "${targetPath}" is not a choice field.`,
          );
        }
        const rawOptions = rawPatch['options'];
        if (!Array.isArray(rawOptions)) {
          throw new EditorConfigurationError(
            `Dependency options for field "${targetPath}" must be an array.`,
          );
        }
        options = new ChoiceOptionStore(rawOptions as readonly SelectOption[]).options();
        if (
          binding.config.type === 'search-select' &&
          options.length > SEARCH_SELECT_MAX_OPTION_COUNT
        ) {
          throw new EditorConfigurationError(
            `Field "${targetPath}" exceeds the ${String(SEARCH_SELECT_MAX_OPTION_COUNT)}-option SearchSelect limit.`,
          );
        }
        if (
          binding.config.type === 'search-select' &&
          binding.config.allowManualValue === true &&
          options.some(({ value }) => typeof value !== 'string')
        ) {
          throw new EditorConfigurationError(
            `Field "${targetPath}" can allow manual values only with string options.`,
          );
        }
      }

      const hasValue = hasOwn(rawPatch, 'value');
      const candidateOptions = options ?? binding.controller.getOptions?.() ?? [];
      if (hasValue) {
        assertCompatibleValue(binding.config, rawPatch['value'], candidateOptions);
      }

      validatedPatches.push({
        binding,
        targetPath,
        hasDisabled,
        ...(hasDisabled ? { disabled: rawPatch['disabled'] as boolean } : {}),
        hasOptions,
        ...(options === undefined ? {} : { options }),
        hasReadOnly,
        ...(hasReadOnly ? { readOnly: rawPatch['readOnly'] as boolean } : {}),
        hasRequired,
        ...(hasRequired ? { required: rawPatch['required'] as boolean } : {}),
        hasValue,
        ...(hasValue ? { value: rawPatch['value'] } : {}),
        hasVisible,
        ...(hasVisible ? { visible: rawPatch['visible'] as boolean } : {}),
      });
    }
    return validatedPatches;
  }

  private async applyPatches(
    patches: readonly ValidatedFieldPatch<TFormValues>[],
  ): Promise<void> {
    for (const patch of patches) {
      const { controller, runtime } = patch.binding;
      if (patch.hasOptions) {
        controller.setOptions?.(patch.options ?? []);
      }
      if (patch.hasValue) {
        if (this.arguments_.applyValue === undefined) {
          controller.setValue(patch.value);
        } else {
          await this.arguments_.applyValue(patch.targetPath, patch.binding, patch.value);
        }
      }
      if (patch.hasVisible) {
        runtime.setVisible(patch.visible ?? false);
      }
      if (patch.hasReadOnly) {
        runtime.setReadOnly(patch.readOnly ?? false);
      }
      if (patch.hasRequired) {
        runtime.setRequired(patch.required ?? false);
      }
      if (patch.hasDisabled) {
        runtime.setDisabled(patch.disabled ?? false);
      }
      await this.arguments_.afterApplyPatch?.({
        binding: patch.binding,
        hasOptions: patch.hasOptions,
        hasValue: patch.hasValue,
        targetPath: patch.targetPath,
      });
    }
  }

  private recordError(sourcePath: string, error: AltEditorLiteError): void {
    this.latestErrorBySource.set(sourcePath, error);
    this.arguments_.onErrorChange(sourcePath, error);
  }

  private clearError(sourcePath: string): void {
    if (this.latestErrorBySource.delete(sourcePath)) {
      this.arguments_.onErrorChange(sourcePath, undefined);
    }
  }
}
