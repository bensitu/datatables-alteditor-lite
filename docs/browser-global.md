# Browser Global

The browser-global object exports the same 0.2.0 inline methods, lifecycle
behavior, and locale resources as the ESM entry. Inline editing does not require
jQuery or a UI framework.

Load DataTables first, optional extensions second, the AltEditorLite browser
bundle third, and any included language registration bundles last. No script
requires jQuery.

```html
<link rel="stylesheet" href="alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="datatables-alteditor-lite.js"></script>
<script src="locales/datatables-alteditor-lite.ja.js"></script>
```

The constructor, language loader, and language registry are on
`globalThis.DataTablesAltEditorLite`:

```js
const language = DataTablesAltEditorLite.getLocale('ja');
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

Available locale artifacts use `en`, `ja`, `zh-cn`, and `es` filenames, with
minified and unminified source-mapped variants. They are generated from the JSON
resources in `src/locales/`.

CDN users can load a custom JSON resource without changing the library:

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  './languages/fr-FR.json',
);
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

Evaluating the main bundle before DataTables throws a load-order error. Evaluating
an included language registration bundle before the main bundle also throws.
These diagnostics prevent silent partial initialization.

The repository demonstration loads the main bundle and JSON languages from built
distribution files. GitHub Pages builds those files before deployment.
