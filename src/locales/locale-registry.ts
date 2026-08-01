import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../core/alt-editor-lite-language.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

const languageByLocaleName = new Map<string, Readonly<AltEditorLiteLanguage>>([
  ['en', ENGLISH_LANGUAGE],
]);

/**
 * Registers a complete locale for Browser Global and application lookup.
 *
 * @param localeName - Non-empty BCP 47 locale name.
 * @param language - Complete translated language object.
 */
export function registerLocale(
  localeName: string,
  language: Readonly<AltEditorLiteLanguage>,
): void {
  if (localeName.trim().length === 0) {
    throw new EditorConfigurationError('A locale name cannot be empty.');
  }

  languageByLocaleName.set(localeName, language);
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
  return languageByLocaleName.get(localeName);
}

/**
 * Lists registered locale names in deterministic registration order.
 *
 * @returns A new immutable-by-contract array of locale names.
 */
export function getRegisteredLocaleNames(): readonly string[] {
  return [...languageByLocaleName.keys()];
}
