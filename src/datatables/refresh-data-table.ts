import type { Api } from 'datatables.net';

interface DataTableInitialization {
  readonly ajax?: unknown;
}

interface AjaxRequestOptions {
  error?: (this: unknown, ...details: unknown[]) => unknown;
  success?: (this: unknown, ...details: unknown[]) => unknown;
  readonly url?: string;
}

const AJAX_RELOAD_TIMEOUT_MS = 30_000;
const drawEvent = 'draw.altEditorLiteRefresh';
const prepareRequestEvent = 'preXhr.altEditorLiteRefresh';

/**
 * Refreshes through the public Ajax API when configured, otherwise redraws.
 *
 * The AbortSignal controls editor ownership and waiting; DataTables does not
 * expose an AbortSignal parameter for `ajax.reload`.
 *
 * @param table - Public DataTables API.
 * @param signal - Current Refresh ownership signal.
 * @param recoveryError - Failure requiring fresh data before editing resumes.
 */
export async function refreshDataTable<TRow extends object>(
  table: Api<TRow>,
  signal: AbortSignal,
  timeoutMs = AJAX_RELOAD_TIMEOUT_MS,
  recoveryError?: Error,
): Promise<void> {
  if (signal.aborted) {
    return;
  }

  const ajax: unknown =
    recoveryError === undefined
      ? (table.init() as DataTableInitialization).ajax
      : table.ajax.url();
  if (ajax == null || (recoveryError !== undefined && ajax === '')) {
    if (recoveryError !== undefined) throw recoveryError;
    table.draw(false);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tableElement = table.table().node();
    let isSettled = false;
    let canCompleteOnDraw = true;
    let hasResponse = recoveryError === undefined;
    const finish = (error?: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      table.off(drawEvent, handleDraw);
      if (recoveryError !== undefined)
        table.off('xhr.altEditorLiteRefresh', handleResponse);
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
      if (hasResponse && canCompleteOnDraw && event.target === tableElement) finish();
    };
    const handleResponse = (event: Event, _settings: unknown, json: unknown): void => {
      if (event.target === tableElement && json != null) hasResponse = true;
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
      const onSuccess = options.success;
      if (typeof ajax !== 'function' && options.url !== '' && onSuccess !== undefined) {
        // The built-in transport draws synchronously while applying its response.
        canCompleteOnDraw = false;
        options.success = function (...details) {
          canCompleteOnDraw = true;
          try {
            return onSuccess.apply(this, details);
          } finally {
            canCompleteOnDraw = false;
          }
        };
      }
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    const timeoutId = globalThis.setTimeout(() => {
      finish(new Error('DataTables Ajax refresh did not complete in time.'));
    }, timeoutMs);
    try {
      table.on(drawEvent, handleDraw);
      if (recoveryError !== undefined)
        table.on('xhr.altEditorLiteRefresh', handleResponse);
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
