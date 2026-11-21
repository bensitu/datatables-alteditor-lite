import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { isPlainCallbackResult } from '../core/is-plain-callback-result.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { settleWithAbort } from '../core/settle-with-abort.js';
import { getPathValue } from '../object-path/get-path-value.js';

import {
  applyDependencyPatches,
  validateDependencyPatches,
} from './dependency-field-patches.js';

import type {
  FormDependencies,
  FormDependencyResolver,
  FormDependencyResult,
} from '../contracts/form-dependency.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldPath } from '../object-path/field-path.js';
import type {
  DependencyFieldBinding,
  DependencyPatchCallbacks,
  ValidatedFieldPatch,
} from './dependency-field-patches.js';

export type {
  DependencyFieldBinding,
  DependencyPatchApplication,
} from './dependency-field-patches.js';

export interface FormDependencyControllerArguments<
  TFormValues extends object,
> extends DependencyPatchCallbacks<TFormValues> {
  readonly dependencies: Readonly<FormDependencies<TFormValues>>;
  readonly fields: ReadonlyMap<string, DependencyFieldBinding<TFormValues>>;
  readonly lifecycleSignal: AbortSignal;
  readonly normalizeError: (error: unknown) => AltEditorLiteError;
  readonly onErrorChange: (
    sourcePath: string,
    error: AltEditorLiteError | undefined,
  ) => void;
  readonly isSourceAvailable?: (sourcePath: string) => boolean;
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

  private patchApplicationTail: Promise<void> = Promise.resolve();

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
    const resolved = resolutions.filter(
      (
        resolution,
      ): resolution is Extract<
        DependencyResolution<TFormValues>,
        { readonly status: 'resolved' }
      > =>
        resolution.status === 'resolved' &&
        this.isCurrent(resolution.sourcePath, resolution.revision),
    );
    if (resolved.length === 0) {
      return;
    }

    const mergedResult = this.mergeInitialResults(resolved.map(({ result }) => result));
    const patches = validateDependencyPatches(mergedResult, this.arguments_.fields);
    await this.queuePatches(patches, () =>
      resolved.every(({ sourcePath, revision }) => this.isCurrent(sourcePath, revision)),
    );
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
      const patches = validateDependencyPatches(
        resolution.result,
        this.arguments_.fields,
      );
      if (!this.isCurrent(sourcePath, resolution.revision)) {
        return;
      }
      await this.queuePatches(patches, () =>
        this.isCurrent(sourcePath, resolution.revision),
      );
      if (this.isCurrent(sourcePath, resolution.revision)) {
        this.clearError(sourcePath);
      }
    } catch (error: unknown) {
      if (this.isCurrent(sourcePath, resolution.revision)) {
        this.recordError(sourcePath, this.arguments_.normalizeError(error));
      }
    }
  }

  /** Waits for currently owned resolver requests and patch application. */
  public async waitForCurrent(signal = this.arguments_.lifecycleSignal): Promise<void> {
    while (this.pendingBySource.size > 0) {
      await settleWithAbort(
        Promise.allSettled([...this.pendingBySource.values()]),
        signal,
      );
    }
    let currentTail: Promise<void>;
    do {
      currentTail = this.patchApplicationTail;
      await settleWithAbort(currentTail, signal);
    } while (currentTail !== this.patchApplicationTail);
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
    const mergedSignal = mergeAbortSignals([
      abortController.signal,
      this.arguments_.lifecycleSignal,
      ...(parentSignal === undefined ? [] : [parentSignal]),
    ]);

    const resolutionPromise = this.invokeResolver(
      sourcePath,
      resolver,
      values,
      mergedSignal.signal,
      revision,
    );
    const completionPromise = resolutionPromise
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        mergedSignal.dispose();
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
      const result = await settleWithAbort(
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
  ): Readonly<Record<string, Record<string, unknown>>> {
    const mergedResult = Object.create(null) as Record<string, Record<string, unknown>>;

    for (const result of results) {
      if (!isPlainCallbackResult(result)) {
        throw new EditorConfigurationError(
          'A dependency resolver must return a field patch object.',
        );
      }
      for (const [targetPath, rawPatch] of Object.entries(result)) {
        if (!isPlainCallbackResult(rawPatch)) {
          throw new EditorConfigurationError(
            `Dependency patch for field "${targetPath}" must be an object.`,
          );
        }
        const mergedPatch = (mergedResult[targetPath] ??= Object.create(null) as Record<
          string,
          unknown
        >);
        for (const [propertyName, propertyValue] of Object.entries(rawPatch)) {
          if (
            Object.hasOwn(mergedPatch, propertyName) &&
            !Object.is(mergedPatch[propertyName], propertyValue)
          ) {
            throw new EditorConfigurationError(
              `Initial dependency resolvers assign conflicting "${propertyName}" values to field "${targetPath}".`,
            );
          }
          mergedPatch[propertyName] = propertyValue;
        }
      }
    }

    return mergedResult;
  }

  private queuePatches(
    patches: readonly ValidatedFieldPatch<TFormValues>[],
    isCurrent: () => boolean,
  ): Promise<void> {
    const application = this.patchApplicationTail.then(() =>
      applyDependencyPatches(this.arguments_, patches, isCurrent),
    );
    this.patchApplicationTail = application.catch(() => undefined);
    return application;
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
