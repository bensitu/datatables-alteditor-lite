import englishLanguage from '../locales/en.json' with { type: 'json' };

import type { DeepPartial } from './editor-values.js';

/**
 * User-facing text used by the editor.
 *
 * English is the built-in source locale. Nested partial overrides are merged
 * with this complete shape.
 */
export interface AltEditorLiteLanguage {
  /** BCP 47 locale used for local matching and sorting. */
  readonly locale: string;
  /** Labels for editor actions. */
  readonly actions: {
    readonly create: string;
    readonly edit: string;
    readonly remove: string;
    readonly refresh: string;
    readonly submit: string;
    readonly cancel: string;
    readonly close: string;
  };
  /** Titles and explanatory dialog text. */
  readonly dialog: {
    readonly createTitle: string;
    readonly editTitle: string;
    readonly removeTitle: string;
    readonly removeCount: string;
    readonly removeMessage: string;
  };
  /** Explanations used by optional DataTables Buttons integration. */
  readonly buttons: {
    readonly createUnavailable: string;
    readonly selectUnavailable: string;
    readonly busy: string;
    readonly editSelection: string;
    readonly removeSelection: string;
    readonly initialize: string;
  };
  /** Native and custom validation fallbacks. */
  readonly validation: {
    readonly required: string;
    readonly invalid: string;
    readonly unique: string;
  };
  /** Text used by SearchSelect fields. */
  readonly searchSelect: {
    readonly placeholder: string;
    readonly searchPlaceholder: string;
    readonly noResults: string;
    readonly clear: string;
  };
  /** Labels and announcements exposed to assistive technology. */
  readonly accessibility: {
    readonly searchSelectInstructions: string;
    readonly searchSelectResults: string;
    readonly searchSelectSelection: string;
  };
  /** Text announced or displayed by inline cell editing. */
  readonly inline: {
    readonly unavailable: string;
    readonly unsupportedField: string;
    readonly saving: string;
    readonly targetUnavailable: string;
    readonly editStarted: string;
    readonly editCancelled: string;
  };
  /** Operation-level error fallbacks. */
  readonly errors: {
    readonly generic: string;
    readonly fileCount: string;
    readonly fileSize: string;
    readonly selectionRequired: string;
    readonly singleSelectionRequired: string;
    readonly targetUnavailable: string;
  };
}

/**
 * Nested language overrides merged on top of the English fallback.
 */
export type PartialEditorLanguage = DeepPartial<AltEditorLiteLanguage>;

/**
 * Language data loaded from an application or external JSON resource.
 */
export type EditorLanguageDefinition = Omit<PartialEditorLanguage, 'locale'> & {
  /** BCP 47 locale associated with the translated text. */
  readonly locale: string;
};

/**
 * Complete built-in English language.
 */
export const ENGLISH_LANGUAGE: Readonly<AltEditorLiteLanguage> = englishLanguage;

function mergeDefinedLanguageText<TSection extends Readonly<Record<string, string>>>(
  fallback: TSection,
  overrides: Readonly<Partial<TSection>> | undefined,
): TSection {
  const merged = { ...fallback };

  if (overrides !== undefined) {
    for (const key of Object.keys(fallback) as (keyof TSection)[]) {
      const value = overrides[key];
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Merges nested language overrides with the complete English fallback.
 *
 * @param language - Consumer-provided language overrides.
 * @returns A complete readonly language object.
 */
export function resolveLanguage(
  language: Readonly<PartialEditorLanguage> | undefined,
): Readonly<AltEditorLiteLanguage> {
  return {
    locale: language?.locale ?? ENGLISH_LANGUAGE.locale,
    actions: mergeDefinedLanguageText(ENGLISH_LANGUAGE.actions, language?.actions),
    dialog: mergeDefinedLanguageText(ENGLISH_LANGUAGE.dialog, language?.dialog),
    buttons: mergeDefinedLanguageText(ENGLISH_LANGUAGE.buttons, language?.buttons),
    validation: mergeDefinedLanguageText(
      ENGLISH_LANGUAGE.validation,
      language?.validation,
    ),
    searchSelect: mergeDefinedLanguageText(
      ENGLISH_LANGUAGE.searchSelect,
      language?.searchSelect,
    ),
    accessibility: mergeDefinedLanguageText(
      ENGLISH_LANGUAGE.accessibility,
      language?.accessibility,
    ),
    inline: mergeDefinedLanguageText(ENGLISH_LANGUAGE.inline, language?.inline),
    errors: mergeDefinedLanguageText(ENGLISH_LANGUAGE.errors, language?.errors),
  };
}
