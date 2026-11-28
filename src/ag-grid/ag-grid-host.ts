import {
  EditorConfigurationError,
  EditorDestroyedError,
  EditorSelectionUnavailableError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { READ_LOADED_ROWS } from '../core/local-uniqueness-validator.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { READ_RECORDS } from '../host/host-record-reader.js';
import { getEditorInstance } from '../instance/editor-instance-store.js';
import { StandaloneHost } from '../standalone/standalone-host.js';

import { AgGridRecords } from './ag-grid-records.js';

import type { HostSelectionCapability } from '../host/editor-host.js';
import type { AgGridApi } from './ag-grid-api.js';

function hasDestroyMethod(instance: object | null): instance is { destroy(): void } {
  return (
    instance !== null && 'destroy' in instance && typeof instance.destroy === 'function'
  );
}

/** Dialog editing for an AG Grid client-side row model with stable string row IDs. */
export class AgGridHost<TRow extends object>
  extends StandaloneHost<TRow, string>
  implements HostSelectionCapability<string>
{
  readonly #records: AgGridRecords<TRow>;
  declare public readonly applyUpdates: NonNullable<
    StandaloneHost<TRow, string>['applyUpdates']
  >;
  declare public readonly entries: NonNullable<StandaloneHost<TRow, string>['entries']>;
  #isDestroyed = false;
  readonly #onGridDestroy = (): void => {
    const editor = getEditorInstance(this.ownershipKey);
    try {
      if (hasDestroyMethod(editor)) editor.destroy();
    } finally {
      this.destroy();
    }
  };

  public constructor(private readonly api: AgGridApi<TRow>) {
    if (api.isDestroyed()) throw new EditorDestroyedError();
    const element = api.getGridElement();
    const getRowId = api.getGridOption('getRowId');
    if (
      element === undefined ||
      typeof getRowId !== 'function' ||
      (api.getGridOption('rowModelType') ?? 'clientSide') !== 'clientSide' ||
      api.getGridOption('treeData') === true
    ) {
      throw new EditorConfigurationError(
        'AgGridHost requires a mounted client-side grid with flat records and getRowId.',
      );
    }
    for (const name of [
      'ClientSideRowModelApiModule',
      'RowApiModule',
      'RenderApiModule',
      'EventApiModule',
    ] as const) {
      if (!api.isModuleRegistered(name)) {
        throw new EditorConfigurationError(`AgGridHost requires ${name}.`);
      }
    }
    const records = new AgGridRecords(api, getRowId);
    super({
      ownershipKey: api,
      eventTarget: element,
      read: (target) => records.resolve([target])[0].data,
      records: () => records.entries(),
      applyCreate: (row, { signal }) => records.add(row, signal),
      applyUpdate: (target, row, { signal }) => {
        records.update([{ target, row }], signal);
        return target;
      },
      applyUpdates: (updates, { signal }) => {
        records.update(updates, signal);
      },
      applyRemove: (targets, { signal }) => {
        records.remove(targets, signal);
      },
      refresh: () => {
        api.refreshClientSideRowModel();
        api.flushAllAnimationFrames();
      },
    });
    this.#records = records;
    api.addEventListener('gridPreDestroyed', this.#onGridDestroy);
  }

  public [READ_RECORDS](targets: readonly string[]): readonly Readonly<TRow>[] {
    this.#assertActive();
    return this.#records.resolve(targets).map(({ data }) => createReadonlyRowView(data));
  }

  public getRowId(row: Readonly<TRow>): string {
    return this.#records.idFor(row);
  }

  public getSelectedTargets(): readonly string[] {
    this.#assertActive();
    if (
      this.api.getGridOption('rowSelection') === undefined ||
      !this.api.isModuleRegistered('RowSelectionModule')
    ) {
      throw new EditorSelectionUnavailableError(
        'Configure AG Grid row selection or supply explicit row IDs.',
      );
    }
    return this.api.getSelectedNodes().map((node) => {
      if (
        node.id === undefined ||
        node.isRowPinned() ||
        node.group === true ||
        node.level !== 0
      ) {
        throw new EditorTargetUnavailableError('Only ordinary data rows can be edited.');
      }
      return node.id;
    });
  }

  public [READ_LOADED_ROWS](exclusion?: Readonly<{ target: string }>): Iterable<TRow> {
    this.#assertActive();
    return this.#records.loadedRows(exclusion?.target);
  }

  public override refresh(
    signal: AbortSignal,
    action?: () => Promise<void>,
  ): Promise<void> {
    if (action === undefined) return super.refresh(signal);
    return super.refresh(signal, async () => {
      await action();
      signal.throwIfAborted();
      this.#assertActive();
      this.api.flushAllAnimationFrames();
    });
  }

  public override destroy(): void {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    this.api.removeEventListener('gridPreDestroyed', this.#onGridDestroy);
    super.destroy();
  }

  #assertActive(): void {
    if (this.#isDestroyed || this.api.isDestroyed()) throw new EditorDestroyedError();
  }
}
