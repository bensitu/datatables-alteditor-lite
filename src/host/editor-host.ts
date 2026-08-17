import type { EditorOperation, EditorOperationMode } from '../core/editor-operation.js';

/** Immutable context supplied while a host applies a canonical result. */
export interface HostApplyContext {
  /** Signal aborted when the owning operation is cancelled or destroyed. */
  readonly signal: AbortSignal;
  /** Operation whose canonical result is being applied. */
  readonly operation: Extract<EditorOperation, 'create' | 'edit' | 'remove'>;
  /** Presentation surface that initiated the operation. */
  readonly mode: EditorOperationMode;
}

/** Minimal record operations required by the host-independent editor runtime. */
export interface EditorHost<TRow extends object, TTarget> {
  /** Event destination used for editor lifecycle notifications. */
  readonly eventTarget: EventTarget;
  /** Stable object identity used to enforce exclusive editor ownership. */
  readonly ownershipKey: object;

  /** Reads the current record represented by an opaque host target. */
  read(target: TTarget): Readonly<TRow>;

  /** Applies a created record and resolves after presentation is stable. */
  applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined>;

  /** Applies a replacement record and resolves after presentation is stable. */
  applyUpdate(
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined>;

  /** Applies record removal and resolves after presentation is stable. */
  applyRemove(
    targets: readonly TTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void>;

  /** Releases resources owned by this host wrapper. */
  destroy(): void;
}

/** Optional host support for resolving consumer selection. */
export interface HostSelectionCapability<TTarget> {
  getSelectedTargets(): readonly TTarget[];
}

/** Optional host support for a stable consumer-visible refresh. */
export interface HostRefreshCapability {
  refresh(signal: AbortSignal): Promise<void>;
}

/** One record exposed by an optional host collection capability. */
export interface HostRecordEntry<TRow extends object, TTarget> {
  readonly target: TTarget;
  readonly row: Readonly<TRow>;
}

/** Optional host support for enumerating records used by local validation. */
export interface HostRowCollectionCapability<TRow extends object, TTarget> {
  entries(): Iterable<Readonly<HostRecordEntry<TRow, TTarget>>>;
}
