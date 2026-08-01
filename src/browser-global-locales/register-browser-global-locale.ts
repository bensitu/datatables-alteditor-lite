import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

interface AltEditorLiteBrowserGlobal {
  readonly registerLocale?: (
    localeName: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) => void;
}

interface LocaleBrowserScope {
  readonly DataTablesAltEditorLite?: AltEditorLiteBrowserGlobal;
}

/**
 * Registers one locale against the already-loaded core Browser Global.
 *
 * @param localeName - Public locale registry name.
 * @param language - Complete translated language.
 * @throws Error when the core Browser Global has not been loaded first.
 */
export function registerBrowserGlobalLocale(
  localeName: string,
  language: Readonly<AltEditorLiteLanguage>,
): void {
  const browserScope = globalThis as LocaleBrowserScope;
  const registerLocale = browserScope.DataTablesAltEditorLite?.registerLocale;
  if (registerLocale === undefined) {
    throw new Error(
      'DataTablesAltEditorLite core must be loaded before a locale bundle.',
    );
  }

  registerLocale(localeName, language);
}
