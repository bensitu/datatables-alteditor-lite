---
audience: public
status: stable
---

# Browser Global

Load DataTables first, optional extensions second, AltEditorLite core third, and
locale bundles last. No script requires jQuery.

```html
<link rel="stylesheet" href="alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="datatables-alteditor-lite.js"></script>
<script src="locales/datatables-alteditor-lite.ja.js"></script>
```

The constructor and locale registry are on `globalThis.DataTablesAltEditorLite`:

```js
const language = DataTablesAltEditorLite.getLocale('ja');
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

Available locale artifacts use `en`, `ja`, `zh-cn`, and `es` filenames, with
minified and unminified source-mapped variants.

Evaluating the core before DataTables throws a load-order error. Evaluating a
locale before the core also throws. These diagnostics are intentional and prevent
silent partial initialization.

The repository demo uses this exact public artifact sequence. Run it with
`npm run build && npm run demo`.
