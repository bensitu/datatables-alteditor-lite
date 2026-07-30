import { EditorSelectionUnavailableError } from '../core/alt-editor-lite-error.js';

import type { Api } from 'datatables.net';

interface SelectRowApi {
  readonly select?: unknown;
}

interface SelectedRowsApi {
  indexes(): {
    toArray(): number[];
  };
}

interface SelectCapableTable {
  rows(selectorModifier: { readonly selected: true }): SelectedRowsApi;
}

/**
 * Detects Select through its public row API extension.
 *
 * @param table - Public DataTables API.
 * @returns Whether Select has extended the table API.
 */
export function hasSelectIntegration<TRow extends object>(table: Api<TRow>): boolean {
  const rowApi = table.row(0) as unknown as SelectRowApi;
  return typeof rowApi.select === 'function';
}

/**
 * Owns optional Select event listeners for one editor instance.
 */
export class SelectIntegration<TRow extends object> {
  private readonly isAvailable: boolean;

  private isDestroyed = false;

  /**
   * Detects Select and subscribes to row selection changes when available.
   *
   * @param table - Public DataTables API.
   * @param onSelectionChange - Integration update callback.
   */
  public constructor(
    private readonly table: Api<TRow>,
    private readonly onSelectionChange: () => void,
  ) {
    this.isAvailable = hasSelectIntegration(table);
    if (this.isAvailable) {
      this.table.on(
        'select.altEditorLite deselect.altEditorLite',
        this.handleSelectionChange,
      );
    }
  }

  /**
   * Reports whether Select extended this table.
   *
   * @returns Current immutable capability result.
   */
  public available(): boolean {
    return this.isAvailable;
  }

  /**
   * Returns selected row indexes using the public Select selector modifier.
   *
   * @returns Selected DataTables row indexes.
   * @throws EditorSelectionUnavailableError when Select is absent.
   */
  public selectedRowIndexes(): readonly number[] {
    if (!this.isAvailable) {
      throw new EditorSelectionUnavailableError();
    }

    const selectCapableTable = this.table as unknown as SelectCapableTable;
    return selectCapableTable.rows({ selected: true }).indexes().toArray();
  }

  /**
   * Removes the owned Select listeners. Repeated calls are harmless.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    if (this.isAvailable) {
      this.table.off(
        'select.altEditorLite deselect.altEditorLite',
        this.handleSelectionChange,
      );
    }
  }

  private readonly handleSelectionChange = (
    _event: Event,
    _table: Api<TRow>,
    selectionType: unknown,
  ): void => {
    if (selectionType === 'row') {
      this.onSelectionChange();
    }
  };
}
