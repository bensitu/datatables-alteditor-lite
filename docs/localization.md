# Localization

Version 0.2.0 language resources include the `inline` section for unavailable
targets, unsupported fields, saving status, edit start, and cancellation
announcements. Partial resources may omit these keys and inherit English text.

AltEditorLite keeps translation data separate from its implementation. English is
the built-in fallback, and every included language is stored as a JSON file under
`src/locales/`. The build discovers those files automatically and produces:

- unchanged JSON resources in `dist/locales/`;
- ESM modules such as `datatables-alteditor-lite/locales/ja`;
- optional Browser Global registration bundles.

Adding an included language requires only one JSON file. No TypeScript wrapper,
build configuration entry, or package export change is required.

## Included languages

ESM applications can import an included language module:

```ts
import ja from 'datatables-alteditor-lite/locales/ja';

const editor = new AltEditorLite(table, {
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
const editor = new AltEditorLite(table, {
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
import { AltEditorLite, loadEditorLanguage } from 'datatables-alteditor-lite';

const language = await loadEditorLanguage('/languages/fr-FR.json');
const editor = new AltEditorLite(table, { fields, language });
```

This follows the same separation between implementation and language data used by
[DataTables internationalisation](https://datatables.net/plug-ins/i18n/), while
keeping the AltEditorLite constructor synchronous and predictable.

The loader accepts partial JSON, validates known keys and placeholder tokens,
canonicalizes the locale identifier, and merges the data with the English
fallback. Network failures throw `EditorLanguageLoadError`. Invalid JSON or an
invalid language shape is non-retryable. Requests time out after 10 seconds and
responses are limited to 64 KiB. A caller-provided `AbortSignal` is forwarded and
can cancel the request earlier. When a response includes a `Content-Type` header,
it must identify `application/json` or an `application/*+json` media type.

Templates must retain their placeholders. For example, `dialog.removeCount`
contains `{count}`, `accessibility.searchSelectResults` contains `{count}`, and
`accessibility.searchSelectSelection` contains `{label}`.

## Browser Global usage

The same loader is available to CDN and script-tag users:

```js
const abortController = new AbortController();
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  './languages/fr-FR.json',
  { signal: abortController.signal },
);
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

Included JSON files are also addressable through npm CDNs. Pin the package version
used by the main bundle in production:

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  'https://cdn.jsdelivr.net/npm/datatables-alteditor-lite@<version>/locales/ja.json',
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
