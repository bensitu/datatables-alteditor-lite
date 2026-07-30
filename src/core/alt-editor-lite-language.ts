import type { DeepPartial } from './editor-values.js';

/**
 * User-facing text used by the editor.
 *
 * English is the built-in source locale. Nested partial overrides are merged
 * with this complete shape.
 */
export interface AltEditorLiteLanguage {
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
    readonly removeMessage: string;
  };
  /** Native and custom validation fallbacks. */
  readonly validation: {
    readonly required: string;
    readonly invalid: string;
    readonly unique: string;
  };
  /** Reserved text for the later SearchSelect field. */
  readonly searchSelect: {
    readonly placeholder: string;
    readonly searchPlaceholder: string;
    readonly noResults: string;
    readonly clear: string;
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
 * Complete built-in English language.
 */
export const ENGLISH_LANGUAGE: Readonly<AltEditorLiteLanguage> = {
  actions: {
    create: 'Create',
    edit: 'Edit',
    remove: 'Remove',
    refresh: 'Refresh',
    submit: 'Submit',
    cancel: 'Cancel',
    close: 'Close',
  },
  dialog: {
    createTitle: 'Create row',
    editTitle: 'Edit row',
    removeTitle: 'Remove rows',
    removeMessage: 'Confirm that the selected rows should be removed.',
  },
  validation: {
    required: 'This field is required.',
    invalid: 'Enter a valid value.',
    unique: 'Enter a unique value.',
  },
  searchSelect: {
    placeholder: 'Select an option',
    searchPlaceholder: 'Search options',
    noResults: 'No matching options',
    clear: 'Clear selection',
  },
  errors: {
    generic: 'The operation could not be completed.',
    fileCount: 'Too many files were selected.',
    fileSize: 'A selected file is too large.',
    selectionRequired: 'Select at least one row.',
    singleSelectionRequired: 'Select exactly one row.',
    targetUnavailable: 'The selected row is no longer available.',
  },
};

/**
 * Merges nested language overrides with the complete English fallback.
 *
 * @param language - Consumer-provided language overrides.
 * @returns A complete immutable-by-contract language object.
 */
export function resolveLanguage(
  language: Readonly<PartialEditorLanguage> | undefined,
): Readonly<AltEditorLiteLanguage> {
  return {
    actions: { ...ENGLISH_LANGUAGE.actions, ...language?.actions },
    dialog: { ...ENGLISH_LANGUAGE.dialog, ...language?.dialog },
    validation: { ...ENGLISH_LANGUAGE.validation, ...language?.validation },
    searchSelect: {
      ...ENGLISH_LANGUAGE.searchSelect,
      ...language?.searchSelect,
    },
    errors: { ...ENGLISH_LANGUAGE.errors, ...language?.errors },
  };
}
