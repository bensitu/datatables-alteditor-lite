import type { Api } from 'datatables.net';

interface DataTableInitialization {
  readonly ajax?: unknown;
}

const AJAX_RELOAD_TIMEOUT_MS = 30_000;

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
  if (signal.aborted) {
    return;
  }

  if (!hasAjaxSource(table)) {
    table.draw(false);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let isSettled = false;
    const finish = (error?: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      signal.removeEventListener('abort', handleAbort);
      globalThis.clearTimeout(timeoutId);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const handleAbort = (): void => {
      finish();
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    const timeoutId = globalThis.setTimeout(() => {
      finish(new Error('DataTables Ajax refresh did not complete in time.'));
    }, AJAX_RELOAD_TIMEOUT_MS);
    try {
      table.ajax.reload(() => {
        finish();
      }, false);
    } catch (error: unknown) {
      finish(
        error instanceof Error
          ? error
          : new Error('DataTables refresh failed.', { cause: error }),
      );
    }
  });
}
