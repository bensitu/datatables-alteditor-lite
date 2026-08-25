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
import { hasOwn } from '../core/has-own.js';

const placeholderPattern = /\{[^{}]+\}/gu;
const LANGUAGE_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_LANGUAGE_RESOURCE_BYTES = 64 * 1024;
const ABSOLUTE_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu;

function containsRawUrlControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

/** Fetch settings and resource limits for an external editor language. */
export interface EditorLanguageLoadOptions extends RequestInit {
  readonly maxResourceBytes?: number;
}

interface LanguageRequestLifetime {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  dispose(): void;
}

function assertSupportedLanguageResource(resource: RequestInfo | URL): void {
  const resourceUrl =
    resource instanceof URL
      ? resource.href
      : typeof Request !== 'undefined' && resource instanceof Request
        ? resource.url
        : typeof resource === 'string'
          ? resource
          : '';
  const normalizedResourceUrl = resourceUrl.trim();
  if (containsRawUrlControlCharacter(resourceUrl)) {
    throw new EditorLanguageLoadError(
      'Editor language resources must not contain control characters.',
      undefined,
      false,
    );
  }
  if (
    normalizedResourceUrl.startsWith('//') ||
    normalizedResourceUrl.startsWith('\\\\')
  ) {
    throw new EditorLanguageLoadError(
      'Editor language resources must not use a protocol-relative URL.',
      undefined,
      false,
    );
  }
  if (
    normalizedResourceUrl.length > 0 &&
    ABSOLUTE_SCHEME_PATTERN.test(normalizedResourceUrl)
  ) {
    let parsedResourceUrl: URL;
    try {
      parsedResourceUrl = new URL(normalizedResourceUrl);
    } catch (cause: unknown) {
      throw new EditorLanguageLoadError(
        'Editor language resources must use a valid HTTP or HTTPS URL.',
        cause,
        false,
      );
    }
    if (
      parsedResourceUrl.protocol !== 'http:' &&
      parsedResourceUrl.protocol !== 'https:'
    ) {
      throw new EditorLanguageLoadError(
        'Editor language resources must use an HTTP or HTTPS URL.',
        undefined,
        false,
      );
    }
    if (parsedResourceUrl.username.length > 0 || parsedResourceUrl.password.length > 0) {
      throw new EditorLanguageLoadError(
        'Editor language resource URLs must not contain embedded credentials.',
        undefined,
        false,
      );
    }
  }
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
  const timeoutId = globalThis.setTimeout(() => {
    if (requestController.signal.aborted) {
      return;
    }
    didTimeOut = true;
    requestController.abort(new DOMException('The request timed out.', 'TimeoutError'));
  }, LANGUAGE_REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = (): void => {
    if (requestController.signal.aborted) {
      return;
    }
    globalThis.clearTimeout(timeoutId);
    requestController.abort(callerSignal?.reason);
  };
  if (callerSignal?.aborted === true) {
    forwardCallerAbort();
  } else {
    callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true });
  }

  return {
    signal: requestController.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      globalThis.clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    },
  };
}

function resolveMaxResourceBytes(maxResourceBytes: number | undefined): number {
  if (maxResourceBytes === undefined) {
    return DEFAULT_MAX_LANGUAGE_RESOURCE_BYTES;
  }
  if (!Number.isSafeInteger(maxResourceBytes) || maxResourceBytes <= 0) {
    throw new EditorConfigurationError(
      'Editor language maxResourceBytes must be a positive safe integer.',
    );
  }
  return maxResourceBytes;
}

async function readLimitedResponseText(
  response: Response,
  maxResourceBytes: number,
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maxResourceBytes
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
      if (byteCount > maxResourceBytes) {
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

function isJsonMediaType(contentType: string): boolean {
  const [mediaType = ''] = contentType.split(';', 1);
  const normalizedMediaType = mediaType.trim().toLowerCase();

  return (
    normalizedMediaType === 'application/json' ||
    (normalizedMediaType.startsWith('application/') &&
      normalizedMediaType.endsWith('+json'))
  );
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
    if (!hasOwn(reference, key)) {
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
 * @param options - Optional Fetch API settings and response size limit.
 * @returns Complete validated language data.
 * @throws EditorConfigurationError when maxResourceBytes is invalid.
 * @throws EditorLanguageLoadError when the request or validation fails.
 */
export async function loadEditorLanguage(
  resource: RequestInfo | URL,
  options?: EditorLanguageLoadOptions,
): Promise<Readonly<AltEditorLiteLanguage>> {
  assertSupportedLanguageResource(resource);
  const { maxResourceBytes: configuredMaxResourceBytes, ...requestInit } = options ?? {};
  const maxResourceBytes = resolveMaxResourceBytes(configuredMaxResourceBytes);
  const requestLifetime = createLanguageRequestLifetime(resource, requestInit);
  try {
    let response: Response;
    try {
      response = await fetch(resource, {
        cache: 'no-cache',
        credentials: 'omit',
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

    const contentType = response.headers.get('content-type');
    if (contentType !== null && !isJsonMediaType(contentType)) {
      throw new EditorLanguageLoadError(
        'The editor language response must use a JSON media type.',
        undefined,
        false,
      );
    }

    let languageData: unknown;
    try {
      languageData = JSON.parse(
        await readLimitedResponseText(response, maxResourceBytes),
      ) as unknown;
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
