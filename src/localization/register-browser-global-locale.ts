import type {
  AltEditorLiteLanguage,
  EditorLanguageDefinition,
} from '../core/alt-editor-lite-language.js';

interface AltEditorLiteBrowserGlobal {
  readonly registerLocale?: (
    language: Readonly<EditorLanguageDefinition>,
  ) => Readonly<AltEditorLiteLanguage>;
}

interface LocaleBrowserScope {
  readonly AltEditorLite?: AltEditorLiteBrowserGlobal;
}

/**
 * Registers one locale against the already-loaded main browser bundle.
 *
 * @param language - Complete translated language.
 * @throws Error when the main browser bundle has not been loaded first.
 */
export function registerBrowserGlobalLocale(
  language: Readonly<AltEditorLiteLanguage>,
): void {
  const browserScope = globalThis as LocaleBrowserScope;
  const registerLocale = browserScope.AltEditorLite?.registerLocale;
  if (registerLocale === undefined) {
    throw new Error(
      'The AltEditorLite browser bundle must be loaded before a language bundle.',
    );
  }

  registerLocale(language);
}
