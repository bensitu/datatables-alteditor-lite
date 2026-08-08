/**
 * Reads a File as a data URL while honoring an AbortSignal.
 *
 * @param file - Browser File selected by the user.
 * @param signal - Signal aborted by stale work or editor destruction.
 * @returns File contents represented as a data URL.
 */
export function readFileAsDataUrl(file: File, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The file read was aborted.', 'AbortError'));
  }

  return new Promise<string>((resolve, reject) => {
    const fileReader = new FileReader();
    let isSettled = false;

    const removeListeners = (): void => {
      signal.removeEventListener('abort', abortRead);
      fileReader.removeEventListener('abort', rejectAbort);
      fileReader.removeEventListener('error', rejectError);
      fileReader.removeEventListener('load', resolveLoad);
    };
    const rejectAbort = (): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      removeListeners();
      reject(new DOMException('The file read was aborted.', 'AbortError'));
    };
    const rejectError = (): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      const fileError =
        fileReader.error ??
        new DOMException('The selected file could not be read.', 'NotReadableError');
      removeListeners();
      reject(fileError);
    };
    const resolveLoad = (): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      const result = fileReader.result;
      removeListeners();

      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(
          new DOMException(
            'The selected file did not produce a data URL.',
            'NotReadableError',
          ),
        );
      }
    };
    const abortRead = (): void => {
      if (fileReader.readyState === FileReader.LOADING) {
        fileReader.abort();
      } else {
        rejectAbort();
      }
    };

    signal.addEventListener('abort', abortRead, { once: true });
    fileReader.addEventListener('abort', rejectAbort, { once: true });
    fileReader.addEventListener('error', rejectError, { once: true });
    fileReader.addEventListener('load', resolveLoad, { once: true });
    if (signal.aborted) {
      rejectAbort();
    } else {
      fileReader.readAsDataURL(file);
    }
  });
}

/**
 * Reads files concurrently as data URLs.
 *
 * @param files - Budget-validated files.
 * @param signal - Signal shared by the collection request.
 * @returns Data URLs in source file order.
 */
export async function readFilesAsDataUrls(
  files: readonly File[],
  signal: AbortSignal,
): Promise<readonly string[]> {
  const batchAbortController = new AbortController();
  const batchSignal = AbortSignal.any([signal, batchAbortController.signal]);
  try {
    return await Promise.all(
      files.map(async (file) => await readFileAsDataUrl(file, batchSignal)),
    );
  } catch (error: unknown) {
    batchAbortController.abort();
    throw error;
  }
}
