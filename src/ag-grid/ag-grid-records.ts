import {
  AltEditorLiteError,
  EditorConfigurationError,
  EditorTargetUnavailableError,
} from '../core/alt-editor-lite-error.js';

import type { HostBatchUpdate, HostRecordEntry } from '../host/editor-host.js';
import type {
  AgGridApi,
  GridRecordNode,
  GridRowId,
  GridTransactionKind,
} from './ag-grid-api.js';

type RecordNode<TRow extends object> = GridRecordNode<TRow> & { id: string; data: TRow };

function isRecordNode<TRow extends object>(
  node: GridRecordNode<TRow>,
): node is RecordNode<TRow> {
  return (
    node.id !== undefined &&
    node.data !== undefined &&
    node.level === 0 &&
    node.group !== true &&
    node.detail !== true &&
    node.footer !== true &&
    !node.isRowPinned()
  );
}

/** Resolves business keys against loaded client-side rows, including filtered rows. */
export class AgGridRecords<TRow extends object> {
  public constructor(
    private readonly api: AgGridApi<TRow>,
    private readonly getRowId: GridRowId<TRow, AgGridApi<TRow>>,
  ) {}

  public resolve(targets: readonly [string]): [RecordNode<TRow>];
  public resolve(targets: readonly string[]): RecordNode<TRow>[];
  public resolve(targets: readonly string[]): RecordNode<TRow>[] {
    const requested = new Set(targets);
    if (requested.size !== targets.length) {
      throw new EditorTargetUnavailableError('The requested records must be distinct.');
    }
    const found = new Map<string, RecordNode<TRow>>();
    this.api.forEachLeafNode((node) => {
      if (node.id === undefined || !requested.has(node.id)) return;
      if (
        found.has(node.id) ||
        !isRecordNode(node) ||
        this.idFor(node.data) !== node.id
      ) {
        throw new EditorTargetUnavailableError(
          'The row ID no longer identifies a unique data record.',
        );
      }
      found.set(node.id, node);
    });
    return targets.map((target) => {
      const node = found.get(target);
      if (node === undefined) throw new EditorTargetUnavailableError();
      return node;
    });
  }

  public entries(): HostRecordEntry<TRow, string>[] {
    const entries: HostRecordEntry<TRow, string>[] = [];
    this.api.forEachLeafNode((node) => {
      if (isRecordNode(node)) entries.push({ target: node.id, row: node.data });
    });
    return entries;
  }

  public add(row: TRow, signal: AbortSignal): string {
    const id = this.idFor(row);
    if (this.api.getRowNode(id) !== undefined) {
      throw new EditorTargetUnavailableError(
        'A record with the new row ID already exists.',
      );
    }
    this.write('add', [row], [id], signal, () => {
      if (this.api.getRowNode(id)?.data === row)
        this.api.applyTransaction({ remove: [row] });
    });
    return id;
  }

  public loadedRows(excludedId?: string): TRow[] {
    const rows: TRow[] = [];
    this.api.forEachLeafNode((node) => {
      if (node.id !== excludedId && isRecordNode(node)) rows.push(node.data);
    });
    return rows;
  }

  public update(
    updates: readonly Readonly<HostBatchUpdate<TRow, string>>[],
    signal: AbortSignal,
  ): void {
    const ids = updates.map(({ target }) => target);
    const originals = this.resolve(ids).map(({ id, data }) => ({ id, data }));
    const rows = updates.map(({ row, target }) => {
      if (this.idFor(row) !== target) {
        throw new EditorTargetUnavailableError(
          'An updated record must retain its row ID.',
        );
      }
      return row;
    });
    this.write('update', rows, ids, signal, () => {
      const restore = originals
        .filter(({ id }, index) => this.api.getRowNode(id)?.data === rows[index])
        .map(({ data }) => data);
      if (restore.length > 0) this.api.applyTransaction({ update: restore });
    });
  }

  public remove(ids: readonly string[], signal: AbortSignal): void {
    const originals = this.resolve(ids).map((node) => ({
      id: node.id,
      row: node.data,
      index: node.sourceRowIndex,
      isSelected: node.isSelected() === true,
    }));
    this.write(
      'remove',
      originals.map(({ row }) => row),
      ids,
      signal,
      (appliedIds) => {
        for (const { id, row, index, isSelected } of originals.sort(
          (a, b) => a.index - b.index,
        )) {
          if (!appliedIds.has(id) || this.api.getRowNode(id) !== undefined) continue;
          const result = this.api.applyTransaction({ add: [row], addIndex: index });
          if (isSelected) result?.add[0]?.setSelected(true);
        }
      },
    );
  }

  public idFor(row: Readonly<TRow>): string {
    const id: unknown = this.getRowId({
      api: this.api,
      context: this.api.getGridOption('context'),
      data: row,
      level: 0,
    });
    if (typeof id !== 'string' || id.length === 0) {
      throw new EditorConfigurationError('getRowId must return a nonempty string.');
    }
    return id;
  }

  private write(
    kind: GridTransactionKind,
    rows: TRow[],
    ids: readonly string[],
    signal: AbortSignal,
    restore: (appliedIds: ReadonlySet<string>) => void,
  ): void {
    signal.throwIfAborted();
    const appliedIds = new Set<string>();
    try {
      const nodes = this.api.applyTransaction({ [kind]: rows })?.[kind];
      for (const node of nodes ?? []) {
        if (node.id !== undefined) appliedIds.add(node.id);
      }
      if (nodes?.length !== ids.length || !ids.every((id) => appliedIds.has(id))) {
        throw new EditorTargetUnavailableError(
          'The grid applied an incomplete record transaction.',
        );
      }
    } catch (cause: unknown) {
      try {
        restore(appliedIds);
      } catch (recoveryError: unknown) {
        throw new AltEditorLiteError({
          code: 'GRID_TRANSACTION',
          message: 'The grid could not restore all records. Refresh the data.',
          cause: new AggregateError([cause, recoveryError]),
        });
      }
      throw new AltEditorLiteError({
        code: 'GRID_TRANSACTION',
        message: 'The grid could not apply all records. Refresh the data.',
        cause,
      });
    }
    this.api.flushAllAnimationFrames();
  }
}
