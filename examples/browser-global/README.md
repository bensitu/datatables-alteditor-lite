# Browser Global example

<!-- prettier-ignore -->
```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/alt-editor-lite.min.css"
/>
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/alt-editor-lite.min.js"></script>
<script src="app.js"></script>
```

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  'https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/esm/locales/ja.json',
);
const editor = new DataTablesAltEditorLite.DataTablesEditor(table, {
  fields,
  language,
});
```

An included registration bundle such as
`dist/umd/locales/alt-editor-lite.ja.min.js` can be loaded after the main
bundle instead of fetching JSON. None of these artifacts requires jQuery. See the
[Browser Global guide](../../docs/browser-global.md) for a complete runnable quick
start, production version pinning, and self-hosted paths.
