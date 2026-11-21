/** Localized text consumed by a SearchSelect instance. */
export interface SearchSelectMessages {
  readonly clear: string;
  readonly instructions: string;
  readonly noResults: string;
  readonly placeholder: string;
  readonly results: string;
  readonly searchPlaceholder: string;
  readonly selection: string;
  readonly loading: string;
  readonly loadError: string;
  readonly searchTooShort: string;
}

export function formatAnnouncement(
  template: string,
  replacements: Readonly<Record<string, string>>,
): string {
  let announcement = template;
  for (const [tokenName, replacement] of Object.entries(replacements)) {
    announcement = announcement.split(`{${tokenName}}`).join(replacement);
  }
  return announcement;
}
