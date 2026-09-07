import {
  EditorConfigurationError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';
import { isPromiseLike } from '../core/complete-row-result.js';
import { mergeAbortSignals } from '../core/merge-abort-signals.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { settleWithAbort } from '../core/settle-with-abort.js';

import type { MaybePromise } from '../fields/field-value.js';
import type {
  EditorHost,
  HostApplyContext,
  HostBatchUpdate,
  HostRecordEntry,
  HostReadContext,
  HostRefreshCapability,
} from '../host/editor-host.js';

type HostResult<T> = T | PromiseLike<T>;

/** Consumer callbacks used by a Standalone Host. */
export interface StandaloneHostOptions<TRow extends object, TTarget> {
  readonly read: (
    target: TTarget,
    context?: Readonly<HostReadContext>,
  ) => MaybePromise<Readonly<TRow>>;
  readonly applyCreate?: (
    row: TRow,
    context: Readonly<HostApplyContext>,
  ) => HostResult<TTarget | undefined>;
  readonly applyUpdate?: (
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ) => HostResult<TTarget | undefined>;
  readonly applyUpdates?: (
    updates: readonly Readonly<HostBatchUpdate<TRow, TTarget>>[],
    context: Readonly<HostApplyContext>,
  ) => HostResult<void>;
  readonly applyRemove?: (
    targets: readonly TTarget[],
    context: Readonly<HostApplyContext>,
  ) => HostResult<void>;
  readonly refresh?: (signal: AbortSignal) => HostResult<void>;
  readonly records?: () => Iterable<Readonly<HostRecordEntry<TRow, TTarget>>>;
  readonly eventTarget?: EventTarget;
  readonly ownershipKey?: object;
}

/** Host bridge for consumer-owned records without a table or grid runtime. */
export class StandaloneHost<TRow extends object, TTarget>
  implements EditorHost<TRow, TTarget>, HostRefreshCapability
{
  public readonly eventTarget: EventTarget;

  public readonly ownershipKey: object;

  public readonly entries:
    (() => Iterable<Readonly<HostRecordEntry<TRow, TTarget>>>) | undefined;

  public readonly applyUpdates:
    | ((
        updates: readonly Readonly<HostBatchUpdate<TRow, TTarget>>[],
        context: Readonly<HostApplyContext>,
      ) => Promise<void>)
    | undefined;

  readonly #lifecycleController = new AbortController();

  public constructor(private readonly options: StandaloneHostOptions<TRow, TTarget>) {
    this.eventTarget = options.eventTarget ?? new EventTarget();
    this.ownershipKey = options.ownershipKey ?? this;
    this.entries =
      options.records === undefined
        ? undefined
        : () => {
            this.#assertActive();
            return Array.from(options.records?.() ?? [], ({ target, row }) => ({
              target,
              row: createReadonlyRowView(row),
            }));
          };
    this.applyUpdates =
      options.applyUpdates === undefined
        ? undefined
        : async (updates, context) => {
            await this.#run(context.signal, (signal) =>
              options.applyUpdates?.(updates, { ...context, signal }),
            );
          };
  }

  public read(
    target: TTarget,
    context?: Readonly<HostReadContext>,
  ): MaybePromise<Readonly<TRow>> {
    const result = this.#run(context?.signal, (signal) =>
      this.options.read(target, { signal }),
    );
    return isPromiseLike(result)
      ? Promise.resolve(result).then((row) => createReadonlyRowView(row))
      : createReadonlyRowView(result);
  }

  public async applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined> {
    this.#assertActive();
    const apply = this.options.applyCreate;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyCreate for Create operations.',
      );
    }
    return await this.#run(context.signal, (signal) =>
      apply(row, { ...context, signal }),
    );
  }

  public async applyUpdate(
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined> {
    this.#assertActive();
    const apply = this.options.applyUpdate;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyUpdate for Edit operations.',
      );
    }
    return await this.#run(context.signal, (signal) =>
      apply(target, row, { ...context, signal }),
    );
  }

  public async applyRemove(
    targets: readonly TTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    this.#assertActive();
    const apply = this.options.applyRemove;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyRemove for Remove operations.',
      );
    }
    await this.#run(context.signal, (signal) => apply(targets, { ...context, signal }));
  }

  public async refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void> {
    this.#assertActive();
    if (action === undefined && this.options.refresh === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires a refresh callback or an operation action.',
      );
    }
    await this.#run(signal, (merged) =>
      action === undefined ? this.options.refresh?.(merged) : action(),
    );
  }

  public destroy(): void {
    this.#lifecycleController.abort();
  }

  #run<T>(
    signal: AbortSignal | undefined,
    action: (signal: AbortSignal) => HostResult<T>,
  ): HostResult<T> {
    this.#assertActive();
    const merged = mergeAbortSignals([
      signal ?? this.#lifecycleController.signal,
      this.#lifecycleController.signal,
    ]);
    try {
      merged.signal.throwIfAborted();
      const result = action(merged.signal);
      if (isPromiseLike(result)) {
        return settleWithAbort(result, merged.signal).finally(() => {
          merged.dispose();
        });
      }
      merged.signal.throwIfAborted();
      merged.dispose();
      return result;
    } catch (error: unknown) {
      merged.dispose();
      throw error;
    }
  }

  #assertActive(): void {
    if (this.#lifecycleController.signal.aborted) {
      throw new EditorDestroyedError();
    }
  }
}
