import type { Api } from 'datatables.net';

interface DataTableInitialization {
  readonly ajax?: unknown;
}

interface AjaxRequestOptions {
  error?: (this: unknown, ...details: unknown[]) => unknown;
}

const AJAX_RELOAD_TIMEOUT_MS = 30_000;
const drawEvent = 'draw.altEditorLiteRefresh';
const prepareRequestEvent = 'preXhr.altEditorLiteRefresh';

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
  timeoutMs = AJAX_RELOAD_TIMEOUT_MS,
): Promise<void> {
  if (signal.aborted) {
    return;
  }

  if (!hasAjaxSource(table)) {
    table.draw(false);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tableElement = table.table().node();
    let isSettled = false;
    const finish = (error?: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      table.off(drawEvent, handleDraw);
      table.off(prepareRequestEvent, prepareRequest);
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
    const handleDraw = (event: Event): void => {
      if (event.target === tableElement) finish();
    };
    const prepareRequest = (
      event: Event,
      _settings: unknown,
      _data: unknown,
      options: AjaxRequestOptions | undefined,
    ): void => {
      if (event.target !== tableElement || options === undefined) return;
      table.off(prepareRequestEvent, prepareRequest);
      const onError = options.error;
      options.error = function (...details) {
        finish(new Error('DataTables Ajax refresh failed.'));
        return onError?.apply(this, details);
      };
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    const timeoutId = globalThis.setTimeout(() => {
      finish(new Error('DataTables Ajax refresh did not complete in time.'));
    }, timeoutMs);
    try {
      table.on(drawEvent, handleDraw);
      table.on(prepareRequestEvent, prepareRequest);
      table.ajax.reload(undefined, false);
    } catch (error: unknown) {
      finish(
        error instanceof Error
          ? error
          : new Error('DataTables refresh failed.', { cause: error }),
      );
    }
  });
}
