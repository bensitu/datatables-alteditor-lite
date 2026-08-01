---
audience: public
status: stable
---

# Localization

English is the complete built-in fallback. Published locale data is available for
English, Japanese, Simplified Chinese, and Spanish:

```ts
import { ja } from 'datatables-alteditor-lite/locales/ja';

const editor = new AltEditorLite(table, {
  fields,
  language: ja,
});
```

The ESM locale subpaths are pure data modules with no registration side effect:

- `datatables-alteditor-lite/locales/en`
- `datatables-alteditor-lite/locales/ja`
- `datatables-alteditor-lite/locales/zh-cn`
- `datatables-alteditor-lite/locales/es`

All locales have identical recursive keys and placeholder tokens. Partial consumer
overrides are deep-merged over English:

```ts
language: {
  actions: { submit: 'Save' },
  searchSelect: { noResults: 'Nothing found' },
}
```

Dialog titles, action buttons, optional DataTables Buttons labels and tooltips,
validation messages, and the selected-row count in Remove confirmation all use the
resolved language. The Remove count template contains the `{count}` placeholder.

There is no `languageUrl` and the library never fetches locale JSON.

Applications that implement their own dynamic locale loader can normalize a
failure with the public `EditorLanguageLoadError`. The error is retryable and may
retain the original `cause`; using it does not enable a library-managed remote
loading mode.

## Browser Global registry

The core Browser Global exposes `registerLocale`, `getLocale`, and
`getRegisteredLocaleNames`. Locale IIFEs register into that public registry and
must load after the core. Loading a locale first throws a clear diagnostic; no
queued second mode exists.

Changing an active editor's language in place is not supported. Destroy and
recreate the editor with the selected registered locale; the DataTables rows stay
owned by the existing table.
