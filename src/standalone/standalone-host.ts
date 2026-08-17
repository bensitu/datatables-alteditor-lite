import {
  EditorConfigurationError,
  EditorDestroyedError,
} from '../core/alt-editor-lite-error.js';

import type {
  EditorHost,
  HostApplyContext,
  HostRecordEntry,
  HostRefreshCapability,
} from '../host/editor-host.js';

type HostResult<T> = T | PromiseLike<T>;

/** Consumer callbacks used by a Standalone Host. */
export interface StandaloneHostOptions<TRow extends object, TTarget> {
  readonly read: (target: TTarget) => Readonly<TRow>;
  readonly applyCreate?: (
    row: TRow,
    context: Readonly<HostApplyContext>,
  ) => HostResult<TTarget | undefined>;
  readonly applyUpdate?: (
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ) => HostResult<TTarget | undefined>;
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

  private isDestroyed = false;

  public constructor(private readonly options: StandaloneHostOptions<TRow, TTarget>) {
    this.eventTarget = options.eventTarget ?? new EventTarget();
    this.ownershipKey = options.ownershipKey ?? this;
    this.entries =
      options.records === undefined
        ? undefined
        : () => {
            this.assertActive();
            return options.records?.() ?? [];
          };
  }

  public read(target: TTarget): Readonly<TRow> {
    this.assertActive();
    return this.options.read(target);
  }

  public async applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined> {
    this.assertActive();
    const apply = this.options.applyCreate;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyCreate for Create operations.',
      );
    }
    context.signal.throwIfAborted();
    const target = await apply(row, context);
    context.signal.throwIfAborted();
    return target;
  }

  public async applyUpdate(
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined> {
    this.assertActive();
    const apply = this.options.applyUpdate;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyUpdate for Edit operations.',
      );
    }
    context.signal.throwIfAborted();
    const nextTarget = await apply(target, row, context);
    context.signal.throwIfAborted();
    return nextTarget;
  }

  public async applyRemove(
    targets: readonly TTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    this.assertActive();
    const apply = this.options.applyRemove;
    if (apply === undefined) {
      throw new EditorConfigurationError(
        'StandaloneHost requires applyRemove for Remove operations.',
      );
    }
    context.signal.throwIfAborted();
    await apply(targets, context);
    context.signal.throwIfAborted();
  }

  public async refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void> {
    this.assertActive();
    signal.throwIfAborted();
    if (action === undefined) {
      await this.options.refresh?.(signal);
    } else {
      await action();
    }
    signal.throwIfAborted();
  }

  public destroy(): void {
    this.isDestroyed = true;
  }

  private assertActive(): void {
    if (this.isDestroyed) {
      throw new EditorDestroyedError();
    }
  }
}
