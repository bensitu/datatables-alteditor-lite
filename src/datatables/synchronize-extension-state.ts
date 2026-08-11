import type { Api } from 'datatables.net';

interface ColumnControlMethods {
  readonly searchList?: (options: 'refresh') => unknown;
}

interface ColumnsWithColumnControl {
  readonly columnControl?: ColumnControlMethods;
}

interface ResponsiveMethods {
  readonly recalc?: () => unknown;
}

interface TableWithResponsive {
  readonly responsive?: ResponsiveMethods;
}

/**
 * Refreshes derived optional-extension state after a committed editor operation.
 *
 * Each integration is detected through its public API. A failure in an optional
 * extension does not change the result of the completed persistence operation.
 *
 * @param table - Public DataTables API for the committed table.
 */
export function synchronizeExtensionStateAfterCommit<TRow extends object>(
  table: Api<TRow>,
): void {
  try {
    const columns = table.columns() as unknown as ColumnsWithColumnControl;
    columns.columnControl?.searchList?.('refresh');
  } catch (error: unknown) {
    console.warn(
      'AltEditorLite could not refresh ColumnControl SearchList options after a committed operation.',
      error,
    );
  }

  try {
    const responsiveTable = table as unknown as TableWithResponsive;
    responsiveTable.responsive?.recalc?.();
  } catch (error: unknown) {
    console.warn(
      'AltEditorLite could not recalculate the Responsive layout after a committed operation.',
      error,
    );
  }
}
