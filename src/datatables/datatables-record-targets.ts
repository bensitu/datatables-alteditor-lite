import {
  EditorSelectionCountError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';

import { createUniqueRowIndexById } from './row-id-resolution.js';
import {
  captureEditTarget,
  captureEditTargetWithValidatedRowId,
  resolveEditTarget,
} from './row-target-resolution.js';

import type { HostRecordEntry } from '../host/editor-host.js';
import type { EditTargetCapture } from './row-target-resolution.js';
import type { Api, RowSelector } from 'datatables.net';

const recordUnavailableMessage = 'The selected record is no longer available.';

declare const dataTablesRecordTargetBrand: unique symbol;

/** Opaque record identity resolved by a DataTables host. */
export interface DataTablesRecordTarget {
  readonly [dataTablesRecordTargetBrand]: true;
}

/**
 * Associates record handles with loaded rows and preserves their identity when
 * DataTables replaces the underlying row objects.
 */
export class DataTablesRecordTargets<TRow extends object> {
  readonly #recordCaptures = new WeakMap<
    DataTablesRecordTarget,
    EditTargetCapture<TRow>
  >();

  readonly #recordTargets = new WeakMap<TRow, DataTablesRecordTarget>();

  readonly #targetsByRowId = new Map<string, DataTablesRecordTarget>();

  readonly #table: Api<TRow>;

  readonly #eventTarget: HTMLTableElement;

  public constructor(table: Api<TRow>, eventTarget: HTMLTableElement) {
    this.#table = table;
    this.#eventTarget = eventTarget;
    table.on('draw.altEditorLiteRecordTargets', this.#pruneRecordTargets);
  }

  public destroy(): void {
    this.#targetsByRowId.clear();
    this.#table.off('draw.altEditorLiteRecordTargets', this.#pruneRecordTargets);
  }

  public sourceRow(target: DataTablesRecordTarget): TRow | undefined {
    return this.#recordCaptures.get(target)?.sourceRow;
  }

  public targetForRow(row: TRow): DataTablesRecordTarget | undefined {
    return this.#recordTargets.get(row);
  }

  public forget(target: DataTablesRecordTarget, removedRow: TRow | undefined): void {
    if (removedRow !== undefined) {
      this.#recordTargets.delete(removedRow);
    }
    const rowId = this.#recordCaptures.get(target)?.snapshot.rowId;
    if (rowId !== undefined && this.#targetsByRowId.get(rowId) === target) {
      this.#targetsByRowId.delete(rowId);
    }
    this.#recordCaptures.delete(target);
  }

  /** Enumerates the records currently loaded by DataTables. */
  public *entries(): IterableIterator<
    Readonly<HostRecordEntry<TRow, DataTablesRecordTarget>>
  > {
    const rows = this.#table.rows();
    const rowIndexes = rows.indexes().toArray();
    const rowIds = rows.ids().toArray() as unknown[];
    const rowIdCounts = new Map<string, number>();
    for (const rowId of rowIds) {
      if (typeof rowId === 'string' && rowId.length > 0) {
        rowIdCounts.set(rowId, (rowIdCounts.get(rowId) ?? 0) + 1);
      }
    }
    for (const rowId of this.#targetsByRowId.keys()) {
      if (rowIdCounts.get(rowId) !== 1) this.#targetsByRowId.delete(rowId);
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
      const capture = captureEditTargetWithValidatedRowId(
        this.#table,
        rowIndex,
        stableRowId,
        recordUnavailableMessage,
      );
      yield {
        row: capture.snapshot.original,
        target: this.store(capture),
      };
    }
  }

  /** Finds the loaded record target for one live DataTables row object. */
  public find(row: TRow): DataTablesRecordTarget | undefined {
    for (const rowIndex of this.#table.rows().indexes().toArray()) {
      if (this.#table.row(rowIndex).data() === row) {
        return this.capture(rowIndex);
      }
    }
    return undefined;
  }

  /** Resolves one DataTables selector to an opaque record target. */
  public select(rowSelector: RowSelector<TRow>): DataTablesRecordTarget {
    const rowIndexes = this.#table.rows(rowSelector).indexes().toArray();
    const rowIndex = rowIndexes[0];
    if (rowIndexes.length !== 1 || rowIndex === undefined) {
      throw new EditorSelectionCountError(
        'exactly-one',
        rowIndexes.length,
        'Exactly one record must match the DataTables selector.',
      );
    }
    return this.capture(rowIndex);
  }

  /** Resolves a DataTables selector to opaque record targets. */
  public selectAll(rowSelector: RowSelector<TRow>): readonly DataTablesRecordTarget[] {
    const rowIndexes = this.#table.rows(rowSelector).indexes().toArray();
    return this.captureAll([...new Set(rowIndexes)]);
  }

  /** Reports whether an opaque record target belongs to this Host wrapper. */
  public owns(target: unknown): target is DataTablesRecordTarget {
    return this.#recordCaptures.has(target as DataTablesRecordTarget);
  }

  readonly #pruneRecordTargets = (event: Event): void => {
    if (event.target !== this.#eventTarget || this.#targetsByRowId.size === 0) return;
    const counts = new Map<string, number>();
    for (const rowId of this.#table.rows().ids().toArray() as unknown[]) {
      if (typeof rowId === 'string' && this.#targetsByRowId.has(rowId)) {
        counts.set(rowId, (counts.get(rowId) ?? 0) + 1);
      }
    }
    for (const [rowId, target] of this.#targetsByRowId) {
      if (counts.get(rowId) === 1) continue;
      this.#targetsByRowId.delete(rowId);
      const capture = this.#recordCaptures.get(target);
      if (capture !== undefined) this.#recordTargets.delete(capture.sourceRow);
    }
  };

  public capture(rowIndex: number): DataTablesRecordTarget {
    return this.store(captureEditTarget(this.#table, rowIndex, recordUnavailableMessage));
  }

  public captureAll(rowIndexes: readonly number[]): readonly DataTablesRecordTarget[] {
    const rowIndexById = createUniqueRowIndexById(this.#table);
    return rowIndexes.map((rowIndex) =>
      this.#captureWithValidatedRowId(
        rowIndex,
        this.validatedRowId(rowIndex, rowIndexById),
      ),
    );
  }

  public validatedRowId(
    rowIndex: number,
    rowIndexById: ReadonlyMap<string, number>,
  ): string | undefined {
    const rowId = this.#table.row(rowIndex).id();
    return typeof rowId === 'string' &&
      rowId.length > 0 &&
      rowIndexById.get(rowId) === rowIndex
      ? rowId
      : undefined;
  }

  #captureWithValidatedRowId(
    rowIndex: number,
    rowId: string | undefined,
  ): DataTablesRecordTarget {
    return this.store(
      captureEditTargetWithValidatedRowId(
        this.#table,
        rowIndex,
        rowId,
        recordUnavailableMessage,
      ),
    );
  }

  public store(capture: EditTargetCapture<TRow>): DataTablesRecordTarget {
    const row = capture.sourceRow;
    const rowId = capture.snapshot.rowId;
    const existingTarget =
      rowId === undefined
        ? this.#recordTargets.get(row)
        : (this.#targetsByRowId.get(rowId) ?? this.#recordTargets.get(row));
    const target = existingTarget ?? (Object.freeze({}) as DataTablesRecordTarget);
    this.remember(target, capture);
    return target;
  }

  public remember(
    target: DataTablesRecordTarget,
    capture: EditTargetCapture<TRow>,
  ): void {
    const previous = this.#recordCaptures.get(target);
    const previousId = previous?.snapshot.rowId;
    const rowId = capture.snapshot.rowId;
    if (
      previousId !== undefined &&
      previousId !== rowId &&
      this.#targetsByRowId.get(previousId) === target
    ) {
      this.#targetsByRowId.delete(previousId);
    }
    if (previous !== undefined && previous.sourceRow !== capture.sourceRow) {
      this.#recordTargets.delete(previous.sourceRow);
    }
    this.#recordCaptures.set(target, capture);
    this.#recordTargets.set(capture.sourceRow, target);
    if (rowId !== undefined) this.#targetsByRowId.set(rowId, target);
  }

  public indexFor(
    targets: readonly DataTablesRecordTarget[],
  ): ReadonlyMap<string, number> | undefined {
    return targets.some(
      (target) => this.#recordCaptures.get(target)?.snapshot.rowId !== undefined,
    )
      ? createUniqueRowIndexById(this.#table)
      : undefined;
  }

  public resolve(
    target: DataTablesRecordTarget,
    rowIndexById?: ReadonlyMap<string, number>,
  ): number {
    const capture = this.#recordCaptures.get(target);
    if (capture === undefined) {
      throw new EditorTargetUnavailableError(
        'The record target was not created by this DataTables host.',
      );
    }
    return resolveEditTarget(
      this.#table,
      this.#eventTarget,
      capture,
      recordUnavailableMessage,
      rowIndexById,
    );
  }
}
