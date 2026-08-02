import {
  EditorConfigurationError,
  EditorLanguageLoadError,
} from '../core/alt-editor-lite-error.js';
import {
  ENGLISH_LANGUAGE,
  resolveLanguage,
  type AltEditorLiteLanguage,
  type EditorLanguageDefinition,
} from '../core/alt-editor-lite-language.js';

const placeholderPattern = /\{[^{}]+\}/gu;
const LANGUAGE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_LANGUAGE_RESOURCE_BYTES = 64 * 1024;

interface LanguageRequestLifetime {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  dispose(): void;
}

function createLanguageRequestLifetime(
  resource: RequestInfo | URL,
  requestInit: RequestInit | undefined,
): LanguageRequestLifetime {
  const requestController = new AbortController();
  const callerSignal =
    requestInit?.signal ??
    (typeof Request !== 'undefined' && resource instanceof Request
      ? resource.signal
      : undefined);
  let didTimeOut = false;

  const forwardCallerAbort = (): void => {
    requestController.abort(callerSignal?.reason);
  };
  if (callerSignal?.aborted === true) {
    forwardCallerAbort();
  } else {
    callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true });
  }

  const timeoutId = globalThis.setTimeout(() => {
    didTimeOut = true;
    requestController.abort();
  }, LANGUAGE_REQUEST_TIMEOUT_MS);

  return {
    signal: requestController.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      globalThis.clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    },
  };
}

async function readLimitedResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_LANGUAGE_RESOURCE_BYTES
  ) {
    throw new EditorLanguageLoadError(
      'The editor language response exceeds the supported size.',
      undefined,
      false,
    );
  }

  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let responseText = '';

  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_LANGUAGE_RESOURCE_BYTES) {
        const resourceSizeError = new EditorLanguageLoadError(
          'The editor language response exceeds the supported size.',
          undefined,
          false,
        );
        await reader.cancel(resourceSizeError).catch(() => undefined);
        throw resourceSizeError;
      }
      responseText += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }

    responseText += decoder.decode();
    return responseText;
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messagePlaceholders(message: string): readonly string[] {
  return [...message.matchAll(placeholderPattern)]
    .map(([placeholder]) => placeholder)
    .sort();
}

function assertLanguageShape(
  value: Readonly<Record<string, unknown>>,
  reference: Readonly<Record<string, unknown>>,
  parentPath = '',
): void {
  for (const [key, nestedValue] of Object.entries(value)) {
    const path = parentPath.length === 0 ? key : `${parentPath}.${key}`;
    if (!Object.hasOwn(reference, key)) {
      throw new EditorConfigurationError(`Unknown editor language key: "${path}".`);
    }

    const referenceValue = reference[key];
    if (typeof referenceValue === 'string') {
      if (typeof nestedValue !== 'string' || nestedValue.trim().length === 0) {
        throw new EditorConfigurationError(
          `Editor language value "${path}" must be a non-empty string.`,
        );
      }

      const expectedPlaceholders = messagePlaceholders(referenceValue);
      const actualPlaceholders = messagePlaceholders(nestedValue);
      if (
        expectedPlaceholders.length !== actualPlaceholders.length ||
        expectedPlaceholders.some(
          (placeholder, index) => placeholder !== actualPlaceholders[index],
        )
      ) {
        throw new EditorConfigurationError(
          `Editor language value "${path}" must preserve its placeholders.`,
        );
      }
      continue;
    }

    if (!isRecord(referenceValue) || !isRecord(nestedValue)) {
      throw new EditorConfigurationError(
        `Editor language value "${path}" must be an object.`,
      );
    }

    assertLanguageShape(nestedValue, referenceValue, path);
  }
}

/**
 * Returns the canonical form of a BCP 47 locale identifier.
 *
 * @param localeName - Locale identifier to normalize.
 * @returns The canonical locale identifier.
 * @throws EditorConfigurationError when the identifier is invalid.
 */
export function normalizeLocaleName(localeName: string): string {
  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(localeName.trim());
    if (canonicalLocale === undefined) {
      throw new RangeError('The locale identifier is empty.');
    }
    return canonicalLocale;
  } catch (cause: unknown) {
    throw new EditorConfigurationError(
      'Editor language locale must be a valid BCP 47 identifier.',
      cause,
    );
  }
}

/**
 * Validates external language data and merges it with the English fallback.
 *
 * @param value - Parsed language resource.
 * @returns Complete validated language data.
 */
export function resolveEditorLanguageResource(
  value: unknown,
): Readonly<AltEditorLiteLanguage> {
  if (!isRecord(value)) {
    throw new EditorConfigurationError('Editor language data must be an object.');
  }

  assertLanguageShape(value, ENGLISH_LANGUAGE);
  const localeValue = value['locale'];
  if (typeof localeValue !== 'string') {
    throw new EditorConfigurationError(
      'Editor language data must include a BCP 47 locale identifier.',
    );
  }

  const definition = {
    ...(value as EditorLanguageDefinition),
    locale: normalizeLocaleName(localeValue),
  };
  return resolveLanguage(definition);
}

/**
 * Loads a JSON language resource and combines it with the English fallback.
 *
 * The editor constructor remains synchronous: await this function before
 * creating an editor instance.
 *
 * @param resource - URL or request for a JSON language resource.
 * @param requestInit - Optional Fetch API request settings.
 * @returns Complete validated language data.
 * @throws EditorLanguageLoadError when the request or validation fails.
 */
export async function loadEditorLanguage(
  resource: RequestInfo | URL,
  requestInit?: RequestInit,
): Promise<Readonly<AltEditorLiteLanguage>> {
  const requestLifetime = createLanguageRequestLifetime(resource, requestInit);
  try {
    let response: Response;
    try {
      response = await fetch(resource, {
        ...requestInit,
        signal: requestLifetime.signal,
      });
    } catch (cause: unknown) {
      throw new EditorLanguageLoadError(
        requestLifetime.timedOut() ? 'The editor language request timed out.' : undefined,
        cause,
      );
    }

    if (!response.ok) {
      const isRetryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      throw new EditorLanguageLoadError(
        `The editor language request failed with HTTP status ${String(response.status)}.`,
        undefined,
        isRetryable,
      );
    }

    let languageData: unknown;
    try {
      languageData = JSON.parse(await readLimitedResponseText(response)) as unknown;
    } catch (cause: unknown) {
      if (cause instanceof EditorLanguageLoadError) {
        throw cause;
      }
      if (requestLifetime.signal.aborted) {
        throw new EditorLanguageLoadError(
          requestLifetime.timedOut()
            ? 'The editor language request timed out.'
            : undefined,
          cause,
        );
      }
      throw new EditorLanguageLoadError(
        'The editor language response is not valid JSON.',
        cause,
        false,
      );
    }

    try {
      return resolveEditorLanguageResource(languageData);
    } catch (cause: unknown) {
      throw new EditorLanguageLoadError(
        'The editor language response has an invalid structure.',
        cause,
        false,
      );
    }
  } finally {
    requestLifetime.dispose();
  }
}
