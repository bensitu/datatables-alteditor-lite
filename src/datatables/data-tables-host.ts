import {
  EditorConfigurationError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';
import { createInlineNavigationIntent } from '../inline/inline-navigation.js';
import { captureInlineTarget } from '../inline/inline-target-capture.js';
import { resolveInlineTarget } from '../inline/inline-target-resolution.js';

import { isColumnVisiblyAvailable } from './column-visibility.js';
import { resolveLogicalCellTarget } from './commit-row-update.js';
import { DrawOwnership } from './draw-ownership.js';
import { dispatchEditorIntegrationUpdate } from './editor-integration-event.js';
import { refreshDataTable } from './refresh-data-table.js';
import { createEditorButtonState } from './register-editor-buttons.js';
import { resolveUniqueRowIndexById } from './row-id-resolution.js';
import {
  captureEditTarget,
  captureRemoveTargets,
  resolveEditTarget,
  resolveRemoveTargets,
} from './row-target-resolution.js';
import { SelectIntegration } from './select-integration.js';
import { synchronizeExtensionStateAfterCommit } from './synchronize-extension-state.js';

import type { LogicalCellTarget } from './commit-row-update.js';
import type {
  EditorButtonState,
  EditorButtonStateInput,
} from './register-editor-buttons.js';
import type { EditTargetCapture, RemoveTargetCapture } from './row-target-resolution.js';
import type { FieldConfig } from '../fields/field-config.js';
import type {
  EditorHost,
  HostApplyContext,
  HostRecordEntry,
  HostRefreshCapability,
  HostRowCollectionCapability,
  HostSelectionCapability,
} from '../host/editor-host.js';
import type { InlineColumnMapping } from '../inline/inline-column-mapping.js';
import type { InlineTargetSummary } from '../inline/inline-edit-state.js';
import type { InlineNavigationIntent } from '../inline/inline-navigation.js';
import type { InlineTargetCapture } from '../inline/inline-target-capture.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

/** DataTables-backed implementation of the neutral record host contract. */
export class DataTablesHost<TRow extends object>
  implements
    EditorHost<TRow, number>,
    HostRefreshCapability,
    HostRowCollectionCapability<TRow, number>,
    HostSelectionCapability<number>
{
  public readonly eventTarget: HTMLTableElement;

  public readonly ownershipKey: object;

  private readonly drawOwnership: DrawOwnership<TRow>;

  private readonly selectIntegration: SelectIntegration<TRow>;

  private isDestroyed = false;

  public constructor(private readonly table: Api<TRow>) {
    const tableElement: unknown = table.table().node();
    if (!(tableElement instanceof HTMLTableElement)) {
      throw new EditorConfigurationError(
        'AltEditorLite requires a DataTables API that owns an HTML table element.',
      );
    }

    this.eventTarget = tableElement;
    this.ownershipKey = tableElement;
    this.drawOwnership = new DrawOwnership(table);
    this.selectIntegration = new SelectIntegration(table, () => {
      this.notifyIntegration();
    });
  }

  /** Returns the DataTables API for explicitly integration-specific work. */
  public unwrap(): Api<TRow> {
    return this.table;
  }

  /** Reads one DataTables record by its resolved internal index. */
  public read(target: number): Readonly<TRow> {
    return this.table.row(target).data();
  }

  /** Adds a record and waits for the editor-owned draw to complete. */
  public async applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<number | undefined> {
    let createdTarget: number | undefined;
    await this.drawOwnership.runWithDraw('create-success', context.signal, () => {
      const addedRows = this.table.rows.add([row]);
      createdTarget = addedRows.indexes().toArray()[0];
      addedRows.draw(false);
    });
    return createdTarget;
  }

  /** Replaces a record and waits for the editor-owned draw to complete. */
  public async applyUpdate(
    target: number,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<number> {
    await this.drawOwnership.runWithDraw(
      context.mode === 'inline' ? 'inline-edit-success' : 'dialog-edit-success',
      context.signal,
      () => {
        this.table.row(target).data(row);
        this.table.draw(false);
      },
    );
    return target;
  }

  /** Removes records and waits for the editor-owned draw to complete. */
  public async applyRemove(
    targets: readonly number[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    await this.drawOwnership.runWithDraw('remove-success', context.signal, () => {
      this.table
        .rows(targets as RowSelector<TRow>)
        .remove()
        .draw(false);
    });
  }

  /** Refreshes DataTables while marking any resulting redraw as editor-owned. */
  public async refresh(signal: AbortSignal, action?: () => Promise<void>): Promise<void> {
    await this.drawOwnership.runWhile('refresh', signal, async () => {
      if (action === undefined) {
        await refreshDataTable(this.table, signal);
      } else {
        await action();
      }
    });
  }

  /** Enumerates the records currently loaded by DataTables. */
  public entries(): Iterable<Readonly<HostRecordEntry<TRow, number>>> {
    const entries: HostRecordEntry<TRow, number>[] = [];
    for (const target of this.table.rows().indexes().toArray()) {
      entries.push({ row: this.table.row(target).data(), target });
    }
    return entries;
  }

  /** Reports whether the optional Select integration is available. */
  public selectionAvailable(): boolean {
    return this.selectIntegration.available();
  }

  /** Returns the current DataTables Select targets. */
  public getSelectedTargets(): readonly number[] {
    return this.selectIntegration.selectedRowIndexes();
  }

  /** Notifies registered DataTables UI integrations about editor state changes. */
  public notifyIntegration(): void {
    dispatchEditorIntegrationUpdate(this.eventTarget);
  }

  /** Synchronizes optional DataTables extensions after presentation cleanup. */
  public synchronizeExtensions(): void {
    synchronizeExtensionStateAfterCommit(this.table);
  }

  /** Derives the current DataTables Buttons presentation state. */
  public createIntegrationButtonState(
    input: Readonly<EditorButtonStateInput>,
  ): EditorButtonState {
    return createEditorButtonState(input);
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
    if (cellNode?.isConnected === true) {
      const cellApi = this.table.cell(cellNode) as unknown as {
        focus?: () => unknown;
      };
      if (typeof cellApi.focus === 'function') {
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
    this.selectIntegration.destroy();
    this.drawOwnership.destroy();
  }

  private focusElement(element: HTMLElement): void {
    const existingTabIndex = element.getAttribute('tabindex');
    if (element.tabIndex < 0 && existingTabIndex === null) {
      element.setAttribute('tabindex', '-1');
    }
    element.focus();
    if (existingTabIndex === null) {
      element.removeAttribute('tabindex');
    }
  }
}
