import {
  EditorConfigurationError,
  EditorSelectionCountError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { InlineColumnMappingRegistry } from '../inline/inline-column-mapping-registry.js';
import { InlineEditController } from '../inline/inline-edit-controller.js';
import { createInlineEditPresentation } from '../inline/inline-edit-presentation.js';
import { createInlineNavigationIntent } from '../inline/inline-navigation.js';
import { captureInlineTarget } from '../inline/inline-target-capture.js';
import { resolveInlineTarget } from '../inline/inline-target-resolution.js';
import { validateInlineConfiguration } from '../inline/validate-inline-configuration.js';

import { applyRowReplacements } from './apply-row-replacements.js';
import { isColumnVisiblyAvailable } from './column-visibility.js';
import { resolveLogicalCellTarget } from './commit-row-update.js';
import { DrawOwnership } from './draw-ownership.js';
import { dispatchEditorIntegrationUpdate } from './editor-integration-event.js';
import { refreshDataTable } from './refresh-data-table.js';
import {
  createUniqueRowIndexById,
  resolveUniqueRowIndexById,
} from './row-id-resolution.js';
import {
  captureEditTarget,
  captureEditTargetWithValidatedRowId,
  captureRemoveTargets,
  resolveEditTarget,
  resolveRemoveTargets,
} from './row-target-resolution.js';
import { SelectIntegration } from './select-integration.js';
import { synchronizeExtensionStateAfterCommit } from './synchronize-extension-state.js';

import type { LogicalCellTarget } from './commit-row-update.js';
import type { EditTargetCapture, RemoveTargetCapture } from './row-target-resolution.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { FieldConfig } from '../fields/field-config.js';
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
import type {
  InlineHostRuntime,
  InlineHostRuntimeArguments,
  InlineHostRuntimeFactory,
} from '../host/inline-host-runtime.js';
import type { InlineColumnMapping } from '../inline/inline-column-mapping.js';
import type { InlineTargetSummary } from '../inline/inline-edit-state.js';
import type { InlineNavigationIntent } from '../inline/inline-navigation.js';
import type { InlineTargetCapture } from '../inline/inline-target-capture.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

declare const dataTablesRecordTargetBrand: unique symbol;

/** Opaque record identity resolved by a DataTables host. */
export interface DataTablesRecordTarget {
  readonly [dataTablesRecordTargetBrand]: true;
}

declare const dataTablesInlineTargetBrand: unique symbol;

/** Opaque cell identity accepted by the neutral inline editor method. */
export interface DataTablesInlineTarget {
  readonly [dataTablesInlineTargetBrand]: true;
}

interface InlineSelectorPair<TRow extends object> {
  readonly row: RowSelector<TRow>;
  readonly column: ColumnSelector;
}

function hasCellFocusMethod(value: unknown): value is { focus(): unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'focus' in value &&
    typeof value.focus === 'function'
  );
}

/** DataTables-backed implementation of the neutral record host contract. */
export class DataTablesHost<TRow extends object>
  implements
    EditorHost<TRow, DataTablesRecordTarget>,
    HostBatchUpdateCapability<TRow, DataTablesRecordTarget>,
    HostPresentationCapability,
    HostRefreshCapability,
    HostRowCollectionCapability<TRow, DataTablesRecordTarget>,
    HostSelectionCapability<DataTablesRecordTarget>,
    InlineHostRuntimeFactory<TRow>
{
  public readonly eventTarget: HTMLTableElement;

  public readonly ownershipKey: object;

  private readonly drawOwnership: DrawOwnership<TRow>;

  private readonly selectIntegration: SelectIntegration<TRow>;

  private isDestroyed = false;

  private readonly recordCaptures = new WeakMap<
    DataTablesRecordTarget,
    EditTargetCapture<TRow>
  >();

  private readonly recordTargets = new WeakMap<TRow, DataTablesRecordTarget>();

  private readonly inlineSelectors = new WeakMap<
    DataTablesInlineTarget,
    InlineSelectorPair<TRow>
  >();

  public constructor(
    private readonly table: Api<TRow>,
    private readonly refreshTimeout = 30_000,
  ) {
    if (!Number.isFinite(refreshTimeout) || refreshTimeout <= 0) {
      throw new EditorConfigurationError(
        'refreshTimeout must be a finite positive number.',
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
    this.drawOwnership = new DrawOwnership(table, refreshTimeout);
    this.selectIntegration = new SelectIntegration(table, () => {
      this.notifyEditorStateChange();
    });
  }

  /** Returns the DataTables API for explicitly integration-specific work. */
  public unwrap(): Api<TRow> {
    return this.table;
  }

  /** Reads one DataTables record by its resolved internal index. */
  public read(target: DataTablesRecordTarget): Readonly<TRow> {
    const rowIndex = this.resolveRecordTargetCapture(target);
    return this.table.row(rowIndex).data();
  }

  /** Adds a record and waits for the editor-owned draw to complete. */
  public async applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<DataTablesRecordTarget | undefined> {
    let createdTarget: number | undefined;
    await this.drawOwnership.runWithDraw('create-success', context.signal, () => {
      const addedRows = this.table.rows.add([row]);
      createdTarget = addedRows.indexes().toArray()[0];
      addedRows.draw(false);
    });
    return createdTarget === undefined
      ? undefined
      : this.createRecordTarget(createdTarget);
  }

  /** Replaces a record and waits for the editor-owned draw to complete. */
  public async applyUpdate(
    target: DataTablesRecordTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<DataTablesRecordTarget> {
    const rowIndex = this.resolveRecordTargetCapture(target);
    const previousRow = this.table.row(rowIndex).data();
    const didApply = await this.drawOwnership.runWithDraw(
      context.mode === 'inline' ? 'inline-edit-success' : 'dialog-edit-success',
      context.signal,
      () => {
        this.table.row(rowIndex).data(row);
        this.table.draw(false);
      },
    );
    if (!didApply) {
      return target;
    }
    this.recordTargets.delete(previousRow);
    this.recordCaptures.set(
      target,
      captureEditTarget(
        this.table,
        rowIndex,
        'The edited record is no longer available.',
      ),
    );
    this.recordTargets.set(row, target);
    return target;
  }

  /** Replaces multiple records and performs one editor-owned draw. */
  public async applyUpdates(
    updates: readonly Readonly<HostBatchUpdate<TRow, DataTablesRecordTarget>>[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    const rowIndexById = this.createRowIdIndexForTargets(
      updates.map(({ target }) => target),
    );
    const resolvedUpdates = updates.map((update) => {
      const rowIndex = this.resolveRecordTargetCapture(update.target, rowIndexById);
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

    const didApply = await this.drawOwnership.runWithDraw(
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
      const rowId = this.table.row(update.rowIndex).id();
      const stableRowId =
        typeof rowId === 'string' &&
        rowId.length > 0 &&
        committedRowIndexById.get(rowId) === update.rowIndex
          ? rowId
          : undefined;
      this.recordTargets.delete(update.previousRow);
      this.recordCaptures.set(
        update.target,
        captureEditTargetWithValidatedRowId(
          this.table,
          update.rowIndex,
          stableRowId,
          'The edited record is no longer available.',
        ),
      );
      this.recordTargets.set(update.row, update.target);
    }
  }

  /** Removes records and waits for the editor-owned draw to complete. */
  public async applyRemove(
    targets: readonly DataTablesRecordTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    const rowIndexById = this.createRowIdIndexForTargets(targets);
    const rowIndexes = targets.map((target) =>
      this.resolveRecordTargetCapture(target, rowIndexById),
    );
    const removedRows = targets.map(
      (target) => this.recordCaptures.get(target)?.sourceRow,
    );
    const didApply = await this.drawOwnership.runWithDraw(
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
      const removedRow = removedRows[position];
      if (removedRow !== undefined) {
        this.recordTargets.delete(removedRow);
      }
      this.recordCaptures.delete(target);
    }
  }

  /** Replaces a row selected by a DataTables internal index for inline editing. */
  public async applyInlineUpdate(
    rowIndex: number,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<number> {
    const previousRow = this.table.row(rowIndex).data();
    const recordTarget = this.recordTargets.get(previousRow);
    const didApply = await this.drawOwnership.runWithDraw(
      'inline-edit-success',
      context.signal,
      () => {
        this.table.row(rowIndex).data(row);
        this.table.draw(false);
      },
    );
    if (!didApply) {
      return rowIndex;
    }
    if (recordTarget !== undefined) {
      this.recordTargets.delete(previousRow);
      this.recordCaptures.set(
        recordTarget,
        captureEditTarget(
          this.table,
          rowIndex,
          'The edited record is no longer available.',
        ),
      );
      this.recordTargets.set(row, recordTarget);
    }
    return rowIndex;
  }

  /** Refreshes DataTables while marking any resulting redraw as editor-owned. */
  public async refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void> {
    await this.drawOwnership.runWhile('refresh', signal, async () => {
      if (action === undefined) {
        await refreshDataTable(this.table, signal, this.refreshTimeout);
      } else {
        await action();
      }
    });
  }

  /** Enumerates the records currently loaded by DataTables. */
  public entries(): Iterable<Readonly<HostRecordEntry<TRow, DataTablesRecordTarget>>> {
    const entries: HostRecordEntry<TRow, DataTablesRecordTarget>[] = [];
    const rows = this.table.rows();
    const rowIndexes = rows.indexes().toArray();
    const rowIds = rows.ids().toArray() as unknown[];
    const rowIdCounts = new Map<string, number>();
    for (const rowId of rowIds) {
      if (typeof rowId === 'string' && rowId.length > 0) {
        rowIdCounts.set(rowId, (rowIdCounts.get(rowId) ?? 0) + 1);
      }
    }
    for (let position = 0; position < rowIndexes.length; position += 1) {
      const rowIndex = rowIndexes[position];
      if (rowIndex === undefined) {
        continue;
      }
      const rowId = rowIds[position];
      const stableRowId =
        typeof rowId === 'string' && rowId.length > 0 && rowIdCounts.get(rowId) === 1
          ? rowId
          : undefined;
      entries.push({
        row: this.table.row(rowIndex).data(),
        target: this.createRecordTargetWithValidatedRowId(rowIndex, stableRowId),
      });
    }
    return entries;
  }

  /** Finds the loaded record target for one live DataTables row object. */
  public findRecordTarget(row: TRow): DataTablesRecordTarget | undefined {
    const knownTarget = this.recordTargets.get(row);
    if (knownTarget !== undefined) {
      return knownTarget;
    }
    for (const { target, row: candidate } of this.entries()) {
      if (candidate === row) {
        return target;
      }
    }
    return undefined;
  }

  /** Reports whether the optional Select integration is available. */
  public selectionAvailable(): boolean {
    return this.selectIntegration.available();
  }

  /** Returns the current DataTables Select targets. */
  public getSelectedTargets(
    unavailableMessage?: string,
  ): readonly DataTablesRecordTarget[] {
    return this.createRecordTargets(
      this.selectIntegration.selectedRowIndexes(unavailableMessage),
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
      ? this.selectIntegration.selectedRowIndexes(unavailableMessage)
      : this.table.rows(rowSelector).indexes().toArray();
  }

  /** Resolves one DataTables selector to an opaque record target. */
  public resolveRecordTarget(rowSelector: RowSelector<TRow>): DataTablesRecordTarget {
    const rowIndexes = this.table.rows(rowSelector).indexes().toArray();
    const rowIndex = rowIndexes[0];
    if (rowIndexes.length !== 1 || rowIndex === undefined) {
      throw new EditorSelectionCountError(
        'exactly-one',
        rowIndexes.length,
        'Exactly one record must match the DataTables selector.',
      );
    }
    return this.createRecordTarget(rowIndex);
  }

  /** Resolves a DataTables selector to opaque record targets. */
  public resolveRecordTargets(
    rowSelector: RowSelector<TRow>,
  ): readonly DataTablesRecordTarget[] {
    const rowIndexes = this.table.rows(rowSelector).indexes().toArray();
    return this.createRecordTargets([...new Set(rowIndexes)]);
  }

  /** Reports whether an opaque record target belongs to this Host wrapper. */
  public ownsRecordTarget(target: unknown): target is DataTablesRecordTarget {
    return (
      typeof target === 'object' &&
      target !== null &&
      this.recordCaptures.has(target as DataTablesRecordTarget)
    );
  }

  /** Creates an opaque inline target from DataTables selectors. */
  public createInlineTarget(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): DataTablesInlineTarget {
    const target = Object.freeze({}) as DataTablesInlineTarget;
    this.inlineSelectors.set(target, { column: columnSelector, row: rowSelector });
    return target;
  }

  /** Creates the DataTables-owned inline editing runtime. */
  public createInlineRuntime<TFormValues extends object>(
    runtime: InlineHostRuntimeArguments<TRow, TFormValues>,
  ): InlineHostRuntime {
    validateInlineConfiguration(this.table, runtime.editorOptions, runtime.editing);
    const mappingRegistry = new InlineColumnMappingRegistry(
      this.table,
      runtime.fields,
      runtime.editing.inline,
    );
    const presentation = createInlineEditPresentation<TRow, TFormValues>(
      runtime.editing.inline.activation,
      runtime.editing.inline,
      runtime.language,
    );
    const controller = new InlineEditController({
      host: this,
      enabled: runtime.enabled,
      editOperationRunner: runtime.editOperationRunner,
      editor: runtime.editor as AltEditorLite<TRow, TFormValues>,
      editorOptions: runtime.editorOptions,
      fields: runtime.fields,
      instanceId: runtime.instanceId,
      interactionCoordinator: runtime.interactionCoordinator,
      language: runtime.language,
      mappingRegistry,
      notifyIntegration: runtime.notifyIntegration,
      operationOwner: runtime.operationOwner,
      options: runtime.editing.inline,
      presentation,
      reportError: runtime.reportError,
      table: this.table,
      tableElement: this.eventTarget,
      validateUnique: runtime.validateUnique,
    });

    return {
      allowsExternalOperation: () => controller.allowsExternalOperation(),
      cancel: () => controller.cancel(),
      destroy: () => {
        controller.destroy();
      },
      getState: () => controller.getState(),
      isEditing: () => controller.isEditing(),
      open: (target) => {
        const selectors =
          typeof target === 'object' && target !== null
            ? this.inlineSelectors.get(target as DataTablesInlineTarget)
            : undefined;
        if (selectors === undefined) {
          return Promise.reject(
            new EditorTargetUnavailableError(
              'The inline target was not created by this DataTables host.',
            ),
          );
        }
        return controller.open(selectors.row, selectors.column);
      },
      prepareForExternalOperation: () => controller.prepareForExternalOperation(),
      submit: () => controller.submit(),
    };
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

  /** Captures one eligible DataTables cell for inline editing. */
  public captureInlineTarget<TFormValues extends object>(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
    fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): InlineTargetCapture<TRow, TFormValues> {
    return captureInlineTarget(
      this.table,
      this.eventTarget,
      rowSelector,
      columnSelector,
      fieldsByName,
      mappings,
      unavailableMessage,
    );
  }

  /** Revalidates an inline row, field mapping, and rendered cell identity. */
  public resolveInlineTarget<TFormValues extends object>(
    capture: InlineTargetCapture<TRow, TFormValues>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): number {
    return resolveInlineTarget(
      this.table,
      this.eventTarget,
      capture,
      mappings,
      unavailableMessage,
    );
  }

  /** Resolves the next eligible inline cell on the current page. */
  public createInlineNavigationIntent<TFormValues extends object>(
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
    currentTarget: Readonly<InlineTargetSummary>,
    direction: 'forward' | 'backward',
  ): Readonly<InlineNavigationIntent> | undefined {
    return createInlineNavigationIntent(
      this.table,
      mappings,
      fieldsByName,
      currentTarget,
      direction,
    );
  }

  /** Resolves a navigation row after a presentation update. */
  public resolveInlineNavigationRow(
    intent: Readonly<InlineNavigationIntent>,
    unavailableMessage: string,
  ): number {
    if (intent.rowId === undefined) {
      return intent.rowIndex;
    }
    const rowIndex = resolveUniqueRowIndexById(this.table, intent.rowId);
    if (rowIndex === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    return rowIndex;
  }

  /** Resolves the cell associated with a completed inline commit. */
  public resolveInlineCommitCell(
    target: Readonly<LogicalCellTarget<TRow>>,
    unavailableMessage: string,
  ): HTMLTableCellElement {
    return resolveLogicalCellTarget(this.table, target, unavailableMessage);
  }

  /** Resolves a stable cell after a consumer-owned refresh. */
  public resolveInlineRefreshCell<TFormValues extends object>(
    summary: Readonly<InlineTargetSummary>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): HTMLTableCellElement {
    if (summary.rowId === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const rowIndexById = resolveUniqueRowIndexById(this.table, summary.rowId);
    if (rowIndexById === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const row = this.table.row(rowIndexById);
    const rowIndex = row.index();
    const column = this.table.column(summary.columnIndex);
    if (
      !row.any() ||
      typeof rowIndex !== 'number' ||
      (summary.columnName !== undefined && column.name() !== summary.columnName) ||
      !isColumnVisiblyAvailable(column) ||
      mappings.get(summary.columnIndex)?.fieldName !== summary.fieldName
    ) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const cellNode = this.table.cell(rowIndex, summary.columnIndex).node();
    if (!(cellNode instanceof HTMLTableCellElement) || !cellNode.isConnected) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    return cellNode;
  }

  /** Restores focus to a logical cell with the owned table as a fallback. */
  public focusInlineCell(cellNode: HTMLTableCellElement | undefined): void {
    if (
      cellNode?.isConnected === true &&
      cellNode.closest('table') === this.eventTarget
    ) {
      const cellApi = this.table.cell(cellNode);
      if (hasCellFocusMethod(cellApi)) {
        cellApi.focus();
        return;
      }
      this.focusElement(cellNode);
      return;
    }
    this.focusElement(this.eventTarget);
  }

  /** Reports whether the editor currently owns a DataTables presentation update. */
  public ownsPresentationChange(): boolean {
    return this.drawOwnership.ownsDraw();
  }

  /** Releases owned DataTables listeners without destroying the table. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    runCleanupSteps([
      () => {
        this.selectIntegration.destroy();
      },
      () => {
        this.drawOwnership.destroy();
      },
    ]);
  }

  private focusElement(element: HTMLElement): void {
    const existingTabIndex = element.getAttribute('tabindex');
    const didAddTemporaryTabIndex = element.tabIndex < 0 && existingTabIndex === null;
    if (didAddTemporaryTabIndex) {
      element.setAttribute('tabindex', '-1');
    }
    try {
      element.focus();
    } finally {
      if (didAddTemporaryTabIndex) {
        element.removeAttribute('tabindex');
      }
    }
  }

  private createRecordTarget(rowIndex: number): DataTablesRecordTarget {
    return this.storeRecordTarget(
      captureEditTarget(
        this.table,
        rowIndex,
        'The selected record is no longer available.',
      ),
    );
  }

  private createRecordTargets(
    rowIndexes: readonly number[],
  ): readonly DataTablesRecordTarget[] {
    const rowIndexById = createUniqueRowIndexById(this.table);
    return rowIndexes.map((rowIndex) => {
      const rowId = this.table.row(rowIndex).id();
      const stableRowId =
        typeof rowId === 'string' &&
        rowId.length > 0 &&
        rowIndexById.get(rowId) === rowIndex
          ? rowId
          : undefined;
      return this.createRecordTargetWithValidatedRowId(rowIndex, stableRowId);
    });
  }

  private createRecordTargetWithValidatedRowId(
    rowIndex: number,
    rowId: string | undefined,
  ): DataTablesRecordTarget {
    return this.storeRecordTarget(
      captureEditTargetWithValidatedRowId(
        this.table,
        rowIndex,
        rowId,
        'The selected record is no longer available.',
      ),
    );
  }

  private storeRecordTarget(capture: EditTargetCapture<TRow>): DataTablesRecordTarget {
    const row = capture.sourceRow;
    const existingTarget = this.recordTargets.get(row);
    if (existingTarget !== undefined) {
      this.recordCaptures.set(existingTarget, capture);
      return existingTarget;
    }
    const target = Object.freeze({}) as DataTablesRecordTarget;
    this.recordCaptures.set(target, capture);
    this.recordTargets.set(row, target);
    return target;
  }

  private createRowIdIndexForTargets(
    targets: readonly DataTablesRecordTarget[],
  ): ReadonlyMap<string, number> | undefined {
    return targets.some(
      (target) => this.recordCaptures.get(target)?.snapshot.rowId !== undefined,
    )
      ? createUniqueRowIndexById(this.table)
      : undefined;
  }

  private resolveRecordTargetCapture(
    target: DataTablesRecordTarget,
    rowIndexById?: ReadonlyMap<string, number>,
  ): number {
    const capture = this.recordCaptures.get(target);
    if (capture === undefined) {
      throw new EditorTargetUnavailableError(
        'The record target was not created by this DataTables host.',
      );
    }
    return resolveEditTarget(
      this.table,
      this.eventTarget,
      capture,
      'The selected record is no longer available.',
      rowIndexById,
    );
  }
}
