import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import { DrawOwnership } from './draw-ownership.js';
import { refreshDataTable } from './refresh-data-table.js';

import type {
  EditorHost,
  HostApplyContext,
  HostRecordEntry,
  HostRefreshCapability,
  HostRowCollectionCapability,
} from '../host/editor-host.js';
import type { Api, RowSelector } from 'datatables.net';

/** DataTables-backed implementation of the neutral record host contract. */
export class DataTablesHost<TRow extends object>
  implements
    EditorHost<TRow, number>,
    HostRefreshCapability,
    HostRowCollectionCapability<TRow, number>
{
  public readonly eventTarget: HTMLTableElement;

  public readonly ownershipKey: object;

  private readonly drawOwnership: DrawOwnership<TRow>;

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
    this.drawOwnership.destroy();
  }
}
