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
  let response: Response;
  try {
    response = await fetch(resource, requestInit);
  } catch (cause: unknown) {
    throw new EditorLanguageLoadError(undefined, cause);
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
    languageData = await response.json();
  } catch (cause: unknown) {
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
}
