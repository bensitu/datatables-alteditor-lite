# Browser Global example

```html
<link rel="stylesheet" href="dist/alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="dist/datatables-alteditor-lite.js"></script>
<script src="app.js"></script>
```

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage('dist/locales/ja.json');
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

An included registration bundle such as
`dist/locales/datatables-alteditor-lite.ja.js` can be loaded after the main bundle
instead of fetching JSON. None of these artifacts requires jQuery.
