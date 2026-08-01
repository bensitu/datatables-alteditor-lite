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

There is no `languageUrl` and the library never fetches locale JSON.

## Browser Global registry

The core Browser Global exposes `registerLocale`, `getLocale`, and
`getRegisteredLocaleNames`. Locale IIFEs register into that public registry and
must load after the core. Loading a locale first throws a clear diagnostic; no
queued second mode exists.

Changing an active editor's language in place is not supported. Destroy and
recreate the editor with the selected registered locale; the DataTables rows stay
owned by the existing table.
