# Browser Global example

```html
<link rel="stylesheet" href="dist/alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="dist/datatables-alteditor-lite.js"></script>
<script src="dist/locales/datatables-alteditor-lite.ja.js"></script>
<script src="app.js"></script>
```

```js
const language = DataTablesAltEditorLite.getLocale('ja');
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

The core must load before locale IIFEs. None of these artifacts requires jQuery.
