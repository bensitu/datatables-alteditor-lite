import type { EditorOperation, EditorOperationMode } from '../core/editor-operation.js';
import type { MaybePromise } from '../fields/field-value.js';

/** Immutable cancellation context supplied while a Host reads a record. */
export interface HostReadContext {
  /** Signal aborted when the owning editor work is cancelled or replaced. */
  readonly signal: AbortSignal;
}

/** Immutable context supplied while a host applies a canonical result. */
export interface HostApplyContext {
  /** Signal aborted when the owning operation is cancelled or destroyed. */
  readonly signal: AbortSignal;
  /** Operation whose canonical result is being applied. */
  readonly operation: Extract<
    EditorOperation,
    'create' | 'edit' | 'batchEdit' | 'remove'
  >;
  /** Presentation surface that initiated the operation. */
  readonly mode: EditorOperationMode;
}

/** One canonical row replacement supplied to a batch-capable Host. */
export interface HostBatchUpdate<TRow extends object, TTarget> {
  readonly target: TTarget;
  readonly row: TRow;
}

/** Optional Host support for applying multiple canonical replacement rows. */
export interface HostBatchUpdateCapability<TRow extends object, TTarget> {
  applyUpdates(
    updates: readonly Readonly<HostBatchUpdate<TRow, TTarget>>[],
    context: Readonly<HostApplyContext>,
  ): Promise<void>;
}

/** Minimal record operations required by the host-independent editor runtime. */
export interface EditorHost<TRow extends object, TTarget> {
  /** Event destination used for editor lifecycle notifications. */
  readonly eventTarget: EventTarget;
  /** Stable object identity used to enforce exclusive editor ownership. */
  readonly ownershipKey: object;

  /** Reads the current record represented by an opaque host target. */
  read(
    target: TTarget,
    context?: Readonly<HostReadContext>,
  ): MaybePromise<Readonly<TRow>>;

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
  getSelectedTargets(unavailableMessage?: string): readonly TTarget[];
}

/** Optional host support for a stable consumer-visible refresh. */
export interface HostRefreshCapability {
  refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void>;
}

/** Optional host support for editor state and presentation notifications. */
export interface HostPresentationCapability {
  notifyEditorStateChange(): void;
  completeEditorPresentation(): void;
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

/** Detects selection support without adding optional methods to EditorHost. */
export function hasHostSelectionCapability<TTarget>(
  host: object,
): host is HostSelectionCapability<TTarget> {
  return 'getSelectedTargets' in host && typeof host.getSelectedTargets === 'function';
}

/** Detects support for applying multiple canonical replacement rows. */
export function hasHostBatchUpdateCapability<TRow extends object, TTarget>(
  host: object,
): host is HostBatchUpdateCapability<TRow, TTarget> {
  return 'applyUpdates' in host && typeof host.applyUpdates === 'function';
}

/** Detects refresh support without adding optional methods to EditorHost. */
export function hasHostRefreshCapability(host: object): host is HostRefreshCapability {
  return 'refresh' in host && typeof host.refresh === 'function';
}

/** Detects presentation notifications supplied by a concrete Host. */
export function hasHostPresentationCapability(
  host: object,
): host is HostPresentationCapability {
  return (
    'notifyEditorStateChange' in host &&
    typeof host.notifyEditorStateChange === 'function' &&
    'completeEditorPresentation' in host &&
    typeof host.completeEditorPresentation === 'function'
  );
}

/** Detects record collection support used by local uniqueness validation. */
export function hasHostRowCollectionCapability<TRow extends object, TTarget>(
  host: object,
): host is HostRowCollectionCapability<TRow, TTarget> {
  return 'entries' in host && typeof host.entries === 'function';
}
