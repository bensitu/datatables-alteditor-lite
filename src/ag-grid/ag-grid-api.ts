/** Public AG Grid operations used by the record editor. */
export interface AgGridApi<TRow extends object> {
  isDestroyed(): boolean;
  getGridElement(): Element | undefined;
  isModuleRegistered(
    name:
      | 'ClientSideRowModelApiModule'
      | 'RowApiModule'
      | 'RenderApiModule'
      | 'EventApiModule'
      | 'RowSelectionModule',
  ): boolean;
  getGridOption(key: 'getRowId'): GridRowId<TRow, this> | undefined;
  getGridOption(key: 'context' | 'rowModelType' | 'rowSelection' | 'treeData'): unknown;
  getRowNode(id: string): GridRecordNode<TRow> | undefined;
  getSelectedNodes(): GridRecordNode<TRow>[];
  forEachLeafNode(callback: (node: GridRecordNode<TRow>) => void): void;
  applyTransaction(transaction: {
    add?: TRow[];
    addIndex?: number;
    update?: TRow[];
    remove?: TRow[];
  }): Record<GridTransactionKind, GridRecordNode<TRow>[]> | null | undefined;
  refreshClientSideRowModel(): void;
  flushAllAnimationFrames(): void;
  addEventListener(type: 'gridPreDestroyed', listener: () => void): void;
  removeEventListener(type: 'gridPreDestroyed', listener: () => void): void;
}

export type GridTransactionKind = 'add' | 'update' | 'remove';

export type GridRowId<TRow, TApi> = (params: {
  data: TRow;
  api: TApi;
  context: unknown;
  level: number;
}) => string;

export interface GridRecordNode<TRow> {
  readonly id: string | undefined;
  readonly data: TRow | undefined;
  readonly level: number;
  readonly group: boolean | undefined;
  readonly detail: boolean | undefined;
  readonly footer: boolean | undefined;
  readonly sourceRowIndex: number;
  isRowPinned(): boolean;
  isSelected(): boolean | undefined;
  setSelected(selected: boolean): void;
}
