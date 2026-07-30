import type { Api } from 'datatables.net';

interface DataTableInitialization {
  readonly ajax?: unknown;
}

function hasAjaxSource<TRow extends object>(table: Api<TRow>): boolean {
  const initialization = table.init() as unknown as DataTableInitialization;
  return initialization.ajax !== undefined && initialization.ajax !== null;
}

/**
 * Refreshes through the public Ajax API when configured, otherwise redraws.
 *
 * The AbortSignal controls editor ownership and waiting; DataTables does not
 * expose an AbortSignal parameter for `ajax.reload`.
 *
 * @param table - Public DataTables API.
 * @param signal - Current Refresh ownership signal.
 */
export async function refreshDataTable<TRow extends object>(
  table: Api<TRow>,
  signal: AbortSignal,
): Promise<void> {
  if (!hasAjaxSource(table)) {
    table.draw(false);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let isSettled = false;
    const finish = (): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      signal.removeEventListener('abort', handleAbort);
      resolve();
    };
    const handleAbort = (): void => {
      finish();
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    try {
      table.ajax.reload(() => {
        finish();
      }, false);
    } catch (error: unknown) {
      isSettled = true;
      signal.removeEventListener('abort', handleAbort);
      reject(
        error instanceof Error
          ? error
          : new Error('DataTables refresh failed.', { cause: error }),
      );
    }
  });
}
