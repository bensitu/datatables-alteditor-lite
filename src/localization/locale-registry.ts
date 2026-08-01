import {
  ENGLISH_LANGUAGE,
  type AltEditorLiteLanguage,
  type EditorLanguageDefinition,
  type PartialEditorLanguage,
} from '../core/alt-editor-lite-language.js';

import {
  normalizeLocaleName,
  resolveEditorLanguageResource,
} from './editor-language-resource.js';

const languageByLocaleName = new Map<string, Readonly<AltEditorLiteLanguage>>([
  ['en', ENGLISH_LANGUAGE],
]);

/**
 * Registers language data for Browser Global and application lookup.
 *
 * @param language - Translated language data with a BCP 47 locale identifier.
 * @returns Complete validated language data stored by the registry.
 */
export function registerLocale(
  language: Readonly<EditorLanguageDefinition>,
): Readonly<AltEditorLiteLanguage>;

/**
 * Registers language data using an explicit locale identifier.
 *
 * @param localeName - BCP 47 locale identifier.
 * @param language - Complete or partial translated language data.
 * @returns Complete validated language data stored by the registry.
 */
export function registerLocale(
  localeName: string,
  language: Readonly<PartialEditorLanguage>,
): Readonly<AltEditorLiteLanguage>;

export function registerLocale(
  localeOrLanguage: string | Readonly<EditorLanguageDefinition>,
  language?: Readonly<PartialEditorLanguage>,
): Readonly<AltEditorLiteLanguage> {
  const languageData =
    typeof localeOrLanguage === 'string'
      ? { ...language, locale: localeOrLanguage }
      : localeOrLanguage;
  const resolvedLanguage = resolveEditorLanguageResource(languageData);

  languageByLocaleName.set(resolvedLanguage.locale, resolvedLanguage);
  return resolvedLanguage;
}

/**
 * Retrieves a registered locale without changing the registry.
 *
 * @param localeName - Registered locale name.
 * @returns The complete locale, or undefined when it is not registered.
 */
export function getLocale(
  localeName: string,
): Readonly<AltEditorLiteLanguage> | undefined {
  try {
    return languageByLocaleName.get(normalizeLocaleName(localeName));
  } catch {
    return undefined;
  }
}

/**
 * Lists registered locale names in deterministic registration order.
 *
 * @returns A new readonly array of locale names.
 */
export function getRegisteredLocaleNames(): readonly string[] {
  return [...languageByLocaleName.keys()];
}
