# Browser Global

The Browser Global distribution exposes the same editing methods, lifecycle
behavior, and language APIs as the ESM entry. It does not require jQuery or a UI
framework.

## Quick start

This example loads DataTables from its CDN and loads both AltEditorLite assets
from jsDelivr:

<!-- prettier-ignore -->
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AltEditorLite quick start</title>
    <link
      rel="stylesheet"
      href="https://cdn.datatables.net/v/dt/dt-3.0.1/datatables.min.css"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/alt-editor-lite.min.css"
    />
  </head>
  <body>
    <button id="create-user" type="button">Create user</button>
    <table id="users">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
        </tr>
      </thead>
    </table>

    <script src="https://cdn.datatables.net/v/dt/dt-3.0.1/datatables.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/datatables-alteditor-lite.min.js"></script>
    <script>
      const table = new DataTable('#users', {
        columns: [{ data: 'name' }, { data: 'email' }],
        data: [],
        rowId: 'id',
      });

      const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
        clientSide: {
          createRow(values) {
            return {
              id: crypto.randomUUID(),
              name: values.name ?? '',
              email: values.email ?? '',
            };
          },
        },
        editing: {
          dialog: { enabled: true },
          inline: { activation: 'doubleClick', enabled: true },
        },
        fields: [
          {
            inlineEdit: true,
            label: 'Name',
            name: 'name',
            required: true,
            type: 'text',
          },
          {
            inlineEdit: true,
            label: 'Email',
            name: 'email',
            required: true,
            type: 'email',
          },
        ],
      });

      document.querySelector('#create-user').addEventListener('click', () => {
        void editor.openCreateDialog();
      });
    </script>
  </body>
</html>
```

The unversioned jsDelivr URLs follow the latest package. Pin the same
`datatables-alteditor-lite` version in both URLs for production. Select a
compatible DataTables build through the
[DataTables download builder](https://datatables.net/download/) when Buttons,
Select, KeyTable, ColReorder, or another extension is needed. Load optional
extensions before constructing an editor; hover keyboard and live reorder support
are detected at runtime. For externally hosted production assets, add
independently verified Subresource Integrity metadata and
`crossorigin="anonymous"`, or self-host the exact files.

## Load order and published files

Load DataTables first, optional DataTables extensions second, the AltEditorLite
browser bundle third, and any included language registration bundles last. The
stylesheet may load in the document head, but it must be present before an editor
is shown.

The npm package publishes these Browser Global files under `dist/umd/`:

- `alt-editor-lite.css` and `alt-editor-lite.min.css`;
- `datatables-alteditor-lite.js` and `datatables-alteditor-lite.min.js`;
- Browser Global language resources under `dist/umd/locales/`.

ESM entry points, declarations, and JSON language resources are published under
`dist/esm/`.

For self-hosting, copy the required `dist/` files and use equivalent local URLs:

<!-- prettier-ignore -->
```html
<link rel="stylesheet" href="/vendor/alt-editor-lite.min.css" />
<script src="/vendor/datatables-alteditor-lite.min.js"></script>
```

The constructor, language loader, and language registry are available through
`globalThis.DataTablesAltEditorLite`.

## Languages

Included language registration bundles must load after the main browser bundle:

<!-- prettier-ignore -->
```html
<script src="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/locales/datatables-alteditor-lite.ja.min.js"></script>
```

```js
const language = DataTablesAltEditorLite.getLocale('ja');
const editor = new DataTablesAltEditorLite.AltEditorLite(table, {
  fields,
  language,
});
```

Available locale filenames use `en`, `ja`, `zh-cn`, and `es`. A custom partial
JSON resource can be loaded without changing the library:

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  './languages/fr-FR.json',
);
```

Evaluating the main bundle before DataTables throws a load-order error. Evaluating
an included language registration bundle before the main bundle also throws.
These diagnostics prevent silent partial initialization.

The repository demonstration uses the same Browser Global API with built
distribution files. GitHub Pages builds those files before deployment.
