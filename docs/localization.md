# Localization

Language resources include `inline.editCell` for the hover pencil and the
SearchSelect `loading`, `loadError`, and `searchTooShort` messages. The `inline`
section also covers unavailable or unsupported targets, and the `alert` section
contains validation and operation error titles. Alert
messages come from normalized errors and field validation. The Close button uses
`actions.close`. Partial resources may omit these keys and inherit English text.

AltEditorLite keeps translation data separate from its implementation. English is
the built-in fallback, and every included language is stored as a JSON file under
`src/locales/`. The build discovers those files automatically and produces:

- unchanged JSON resources in `dist/esm/locales/`;
- ESM modules such as `datatables-alteditor-lite/locales/ja`;
- optional Browser Global registration bundles.

Adding an included language requires only one JSON file. No TypeScript wrapper,
build configuration entry, or package export change is required.

## Included languages

ESM applications can import an included language module:

```ts
import ja from 'datatables-alteditor-lite/locales/ja';

const editor = new DataTablesEditor(table, {
  fields,
  language: ja,
});
```

The package includes English (`en`), Japanese (`ja`), Simplified Chinese
(`zh-cn`), and Spanish (`es`). Their JSON files provide examples of the complete
shape and required placeholders.

To contribute another included language, copy `src/locales/en.json`, use a
lowercase locale filename such as `pt-br.json`, set its `locale` property to the
canonical BCP 47 identifier such as `pt-BR`, and translate every value. Keep the
same keys and placeholders. The build validates the resource and generates every
published format automatically; no source registration or configuration change is
needed.

## Application-provided languages

Applications can provide partial language data directly in the options. The
`locale` value is a BCP 47 identifier, and omitted text falls back to English:

```ts
const editor = new DataTablesEditor(table, {
  fields,
  language: {
    locale: 'fr-FR',
    actions: {
      cancel: 'Annuler',
      submit: 'Enregistrer',
    },
  },
});
```

No library rebuild is required.

For a separate JSON resource, await `loadEditorLanguage` before constructing the
editor:

```ts
import {
  DataTablesEditor,
  loadEditorLanguage,
} from 'datatables-alteditor-lite/datatables';

const language = await loadEditorLanguage('/languages/fr-FR.json');
const editor = new DataTablesEditor(table, { fields, language });
```

This follows the same separation between implementation and language data used by
[DataTables internationalisation](https://datatables.net/plug-ins/i18n/), while
keeping the AltEditorLite constructor synchronous and predictable.

The loader accepts partial JSON, validates known keys and placeholder tokens,
canonicalizes the locale identifier, and merges the data with the English
fallback. Network failures throw `EditorLanguageLoadError`. Invalid JSON or an
invalid language shape is non-retryable. Requests time out after 10 seconds and
responses are limited to 64 KiB by default. A larger validated resource can set a
positive safe-integer byte limit without changing the library:

```ts
const language = await loadEditorLanguage('/languages/enterprise.json', {
  maxResourceBytes: 256 * 1024,
});
```

A caller-provided `AbortSignal` is forwarded and can cancel the request earlier.
Other standard `RequestInit` settings can be provided in the same object;
`maxResourceBytes` is consumed by the loader and is not forwarded to `fetch`.
Requests omit credentials and revalidate cached responses by default. Applications
can override either Fetch API setting when a trusted resource requires a different
policy.
When a response includes a `Content-Type` header, it must identify
`application/json` or an `application/*+json` media type. Relative URLs and
absolute HTTP or HTTPS URLs are supported. Protocol-relative URLs, embedded URL
credentials, and other absolute URL schemes are rejected before a request is made.

Templates must retain their placeholders. For example, `dialog.removeCount`
contains `{count}`, `accessibility.searchSelectResults` contains `{count}`, and
`searchSelect.searchTooShort` contains `{count}` while
`accessibility.searchSelectSelection` contains `{label}`.

## Browser Global usage

The same loader is available to CDN and script-tag users:

```js
const abortController = new AbortController();
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  './languages/fr-FR.json',
  { signal: abortController.signal },
);
const editor = new DataTablesAltEditorLite.DataTablesEditor(table, {
  fields,
  language,
});
```

Included JSON files are also addressable through npm CDNs. Pin the package version
used by the main bundle in production:

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  'https://cdn.jsdelivr.net/npm/datatables-alteditor-lite@<version>/dist/esm/locales/ja.json',
);
```

Applications that want name-based lookup can register the result:

```js
DataTablesAltEditorLite.registerLocale(language);
DataTablesAltEditorLite.getLocale('fr-fr'); // canonical lookup
```

Included Browser Global language bundles remain available for static script-tag
setups and register themselves after the main bundle loads.

Changing an active editor's language in place is not supported. Destroy and
recreate the editor with the selected language; the existing DataTables rows stay
owned by the table.
