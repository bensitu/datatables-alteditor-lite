import {
  EditorConfigurationError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { READ_SELECTED_ROW_COUNT } from '../core/editor-button-integration.js';
import { READ_LOADED_ROWS } from '../core/local-uniqueness-validator.js';
import { createReadonlyRowView } from '../core/readonly-row-view.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';

import { applyRowReplacements } from './apply-row-replacements.js';
import {
  DataTablesRecordTargets,
  type DataTablesRecordTarget,
} from './datatables-record-targets.js';
import { DrawOwnership } from './draw-ownership.js';
import { dispatchEditorIntegrationUpdate } from './editor-integration-event.js';
import { refreshDataTable } from './refresh-data-table.js';
import { createUniqueRowIndexById } from './row-id-resolution.js';
import {
  captureEditTarget,
  captureEditTargetWithValidatedRowId,
  captureRemoveTargets,
  resolveEditTarget,
  resolveRemoveTargets,
} from './row-target-resolution.js';
import { SelectIntegration } from './select-integration.js';
import { synchronizeExtensionStateAfterCommit } from './synchronize-extension-state.js';

import type {
  EditorHost,
  HostApplyContext,
  HostBatchUpdate,
  HostBatchUpdateCapability,
  HostPresentationCapability,
  HostRecordEntry,
  HostRefreshCapability,
  HostRowCollectionCapability,
  HostSelectionCapability,
} from '../host/editor-host.js';
import type { EditTargetCapture, RemoveTargetCapture } from './row-target-resolution.js';
import type { Api, RowSelector } from 'datatables.net';

/** DataTables-backed implementation of the neutral record host contract. */
export class DataTablesRecordHost<TRow extends object>
  implements
    EditorHost<TRow, DataTablesRecordTarget>,
    HostBatchUpdateCapability<TRow, DataTablesRecordTarget>,
    HostPresentationCapability,
    HostRefreshCapability,
    HostRowCollectionCapability<TRow, DataTablesRecordTarget>,
    HostSelectionCapability<DataTablesRecordTarget>
{
  public readonly eventTarget: HTMLTableElement;

  public readonly ownershipKey: object;

  readonly #drawOwnership: DrawOwnership<TRow>;

  readonly #selectIntegration: SelectIntegration<TRow>;

  #isDestroyed = false;

  protected readonly records: DataTablesRecordTargets<TRow>;

  public constructor(
    protected readonly table: Api<TRow>,
    private readonly refreshTimeout = 30_000,
  ) {
    if (
      !Number.isFinite(refreshTimeout) ||
      refreshTimeout <= 0 ||
      refreshTimeout > 2_147_483_647
    ) {
      throw new EditorConfigurationError(
        'refreshTimeout must be positive and at most 2147483647 milliseconds.',
      );
    }
    const tableElement: unknown = table.table().node();
    if (!(tableElement instanceof HTMLTableElement)) {
      throw new EditorConfigurationError(
        'AltEditorLite requires a DataTables API that owns an HTML table element.',
      );
    }

    this.eventTarget = tableElement;
    this.ownershipKey = tableElement;
    this.#drawOwnership = new DrawOwnership(table, refreshTimeout);
    this.records = new DataTablesRecordTargets(table, tableElement);
    this.#selectIntegration = new SelectIntegration(table, () => {
      this.notifyEditorStateChange();
    });
  }

  /** Returns the DataTables API for explicitly integration-specific work. */
  public unwrap(): Api<TRow> {
    return this.table;
  }

  /** Reads one DataTables record by its resolved internal index. */
  public read(target: DataTablesRecordTarget): Readonly<TRow> {
    const rowIndex = this.records.resolve(target);
    return createReadonlyRowView(this.table.row(rowIndex).data());
  }

  /** Adds a record and waits for the editor-owned draw to complete. */
  public async applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<DataTablesRecordTarget | undefined> {
    let createdTarget: number | undefined;
    await this.#drawOwnership.runWithDraw('create-success', context.signal, () => {
      const addedRows = this.table.rows.add([row]);
      createdTarget = addedRows.indexes().toArray()[0];
      addedRows.draw(false);
    });
    return createdTarget === undefined ? undefined : this.records.capture(createdTarget);
  }

  /** Replaces a record and waits for the editor-owned draw to complete. */
  public async applyUpdate(
    target: DataTablesRecordTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<DataTablesRecordTarget> {
    const rowIndex = this.records.resolve(target);
    await this.#replaceRow(
      rowIndex,
      row,
      context.signal,
      context.mode === 'inline' ? 'inline-edit-success' : 'dialog-edit-success',
      target,
    );
    return target;
  }

  /** Replaces multiple records and performs one editor-owned draw. */
  public async applyUpdates(
    updates: readonly Readonly<HostBatchUpdate<TRow, DataTablesRecordTarget>>[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    const rowIndexById = this.records.indexFor(updates.map(({ target }) => target));
    const resolvedUpdates = updates.map((update) => {
      const rowIndex = this.records.resolve(update.target, rowIndexById);
      return {
        previousRow: this.table.row(rowIndex).data(),
        row: update.row,
        rowIndex,
        target: update.target,
      };
    });
    if (
      new Set(resolvedUpdates.map(({ rowIndex }) => rowIndex)).size !==
      resolvedUpdates.length
    ) {
      throw new EditorTargetUnavailableError(
        'Batch Edit targets must identify distinct records.',
      );
    }

    const didApply = await this.#drawOwnership.runWithDraw(
      'batch-edit-success',
      context.signal,
      () => {
        applyRowReplacements(
          resolvedUpdates.map((update) => ({
            previousRow: update.previousRow,
            row: update.row,
            write: (row: TRow) => {
              this.table.row(update.rowIndex).data(row);
            },
          })),
        );
        this.table.draw(false);
      },
    );
    if (!didApply) {
      return;
    }

    const committedRowIndexById = createUniqueRowIndexById(this.table);
    for (const update of resolvedUpdates) {
      this.records.remember(
        update.target,
        captureEditTargetWithValidatedRowId(
          this.table,
          update.rowIndex,
          this.records.validatedRowId(update.rowIndex, committedRowIndexById),
          'The edited record is no longer available.',
        ),
      );
    }
  }

  /** Removes records and waits for the editor-owned draw to complete. */
  public async applyRemove(
    targets: readonly DataTablesRecordTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    const rowIndexById = this.records.indexFor(targets);
    const rowIndexes = targets.map((target) =>
      this.records.resolve(target, rowIndexById),
    );
    const removedRows = targets.map((target) => this.records.sourceRow(target));
    const didApply = await this.#drawOwnership.runWithDraw(
      'remove-success',
      context.signal,
      () => {
        this.table
          .rows(rowIndexes as RowSelector<TRow>)
          .remove()
          .draw(false);
      },
    );
    if (!didApply) {
      return;
    }
    for (const [position, target] of targets.entries()) {
      this.records.forget(target, removedRows[position]);
    }
  }

  /** Replaces a row selected by a DataTables internal index for inline editing. */
  public async applyInlineUpdate(
    rowIndex: number,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<number> {
    const previousRow = this.table.row(rowIndex).data();
    await this.#replaceRow(
      rowIndex,
      row,
      context.signal,
      'inline-edit-success',
      this.records.targetForRow(previousRow),
    );
    return rowIndex;
  }

  async #replaceRow(
    rowIndex: number,
    row: TRow,
    signal: AbortSignal,
    drawReason: 'inline-edit-success' | 'dialog-edit-success',
    recordTarget: DataTablesRecordTarget | undefined,
  ): Promise<void> {
    const didApply = await this.#drawOwnership.runWithDraw(drawReason, signal, () => {
      this.table.row(rowIndex).data(row);
      this.table.draw(false);
    });
    if (didApply && recordTarget !== undefined) {
      this.records.remember(
        recordTarget,
        captureEditTarget(
          this.table,
          rowIndex,
          'The edited record is no longer available.',
        ),
      );
    }
  }

  /** Refreshes DataTables while marking any resulting redraw as editor-owned. */
  public async refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void> {
    await this.#drawOwnership.runWhile('refresh', signal, async () => {
      if (action === undefined) {
        await refreshDataTable(this.table, signal, this.refreshTimeout);
      } else {
        await action();
      }
    });
  }

  /** Enumerates the records currently loaded by DataTables. */
  public entries(): IterableIterator<
    Readonly<HostRecordEntry<TRow, DataTablesRecordTarget>>
  > {
    return this.records.entries();
  }

  public [READ_LOADED_ROWS](
    exclusion?: Readonly<{ target: DataTablesRecordTarget }>,
  ): Iterable<TRow> | undefined {
    const rows = this.table.rows();
    const data = rows.data().toArray();
    if (exclusion === undefined) return data;

    try {
      const excludedPosition = rows
        .indexes()
        .indexOf(this.records.resolve(exclusion.target));
      return data.filter((_row, position) => position !== excludedPosition);
    } catch (error: unknown) {
      if (error instanceof EditorTargetUnavailableError) return undefined;
      throw error;
    }
  }

  /** Finds the loaded record target for one live DataTables row object. */
  public findRecordTarget(row: TRow): DataTablesRecordTarget | undefined {
    return this.records.find(row);
  }

  /** Resolves one DataTables selector to an opaque record target. */
  public resolveRecordTarget(selector: RowSelector<TRow>): DataTablesRecordTarget {
    return this.records.select(selector);
  }

  /** Resolves a DataTables selector to opaque record targets. */
  public resolveRecordTargets(
    selector: RowSelector<TRow>,
  ): readonly DataTablesRecordTarget[] {
    return this.records.selectAll(selector);
  }

  /** Reports whether an opaque record target belongs to this Host wrapper. */
  public ownsRecordTarget(target: unknown): target is DataTablesRecordTarget {
    return this.records.owns(target);
  }

  /** Reports whether the optional Select integration is available. */
  public selectionAvailable(): boolean {
    return this.#selectIntegration.available();
  }

  public [READ_SELECTED_ROW_COUNT](): number | undefined {
    return this.#selectIntegration.selectedRowCount();
  }

  /** Returns the current DataTables Select targets. */
  public getSelectedTargets(
    unavailableMessage?: string,
  ): readonly DataTablesRecordTarget[] {
    return this.records.captureAll(
      this.#selectIntegration.selectedRowIndexes(unavailableMessage),
    );
  }

  /** Notifies registered DataTables UI integrations about editor state changes. */
  public notifyEditorStateChange(): void {
    dispatchEditorIntegrationUpdate(this.eventTarget);
  }

  /** Completes optional extension synchronization after presentation cleanup. */
  public completeEditorPresentation(): void {
    synchronizeExtensionStateAfterCommit(this.table);
  }

  /** Synchronizes optional extensions after a DataTables inline session. */
  public synchronizeExtensions(): void {
    this.completeEditorPresentation();
  }

  /** Resolves an explicit row selector or the current Select selection. */
  public resolveRequestedRowIndexes(
    rowSelector: RowSelector<TRow> | undefined,
    unavailableMessage: string,
  ): readonly number[] {
    return rowSelector === undefined
      ? this.#selectIntegration.selectedRowIndexes(unavailableMessage)
      : this.table.rows(rowSelector).indexes().toArray();
  }

  /** Captures one validated DataTables row identity. */
  public captureEditTarget(
    rowIndex: number,
    unavailableMessage: string,
  ): EditTargetCapture<TRow> {
    return captureEditTarget(this.table, rowIndex, unavailableMessage);
  }

  /** Captures validated DataTables row identities for removal. */
  public captureRemoveTargets(
    rowIndexes: readonly number[],
    unavailableMessage: string,
  ): RemoveTargetCapture<TRow> {
    return captureRemoveTargets(this.table, rowIndexes, unavailableMessage);
  }

  /** Revalidates one previously captured row identity. */
  public resolveEditTarget(
    capture: EditTargetCapture<TRow>,
    unavailableMessage: string,
  ): number {
    return resolveEditTarget(this.table, this.eventTarget, capture, unavailableMessage);
  }

  /** Revalidates a previously captured row set atomically. */
  public resolveRemoveTargets(
    capture: RemoveTargetCapture<TRow>,
    unavailableMessage: string,
  ): readonly number[] {
    return resolveRemoveTargets(
      this.table,
      this.eventTarget,
      capture,
      unavailableMessage,
    );
  }

  /** Reports whether the editor currently owns a DataTables presentation update. */
  public ownsPresentationChange(): boolean {
    return this.#drawOwnership.ownsDraw();
  }

  /** Releases owned DataTables listeners without destroying the table. */
  public destroy(): void {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;
    this.records.destroy();
    runCleanupSteps([
      () => {
        this.#selectIntegration.destroy();
      },
      () => {
        this.#drawOwnership.destroy();
      },
    ]);
  }
}
