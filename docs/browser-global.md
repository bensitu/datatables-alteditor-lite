# Browser Global

The primary Browser Global distribution provides the DataTables constructor, the
neutral constructor, lifecycle APIs, and language utilities. It does not require
jQuery or a UI framework.

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
      href="https://cdn.datatables.net/v/dt/dt-3.0.2/datatables.min.css"
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

    <script src="https://cdn.datatables.net/v/dt/dt-3.0.2/datatables.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/alt-editor-lite.min.js"></script>
    <script>
      const table = new DataTable('#users', {
        columns: [{ data: 'name' }, { data: 'email' }],
        data: [],
        rowId: 'id',
      });

      const editor = new AltEditorLite.Editor(table, {
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
extensions before the AltEditorLite browser bundle; hover keyboard and live
reorder support are detected at runtime. For externally hosted production assets, add
independently verified Subresource Integrity metadata and
`crossorigin="anonymous"`, or self-host the exact files.

## Load order and published files

Load DataTables first, optional DataTables extensions second, the AltEditorLite
browser bundle third, and any included language registration bundles last. The
stylesheet may load in the document head, but it must be present before an editor
is shown.

The npm package publishes these Browser Global files under `dist/umd/`:

- `alt-editor-lite.css` and `alt-editor-lite.min.css`;
- `alt-editor-lite.js` and `alt-editor-lite.min.js`;
- `alt-editor-lite-standalone.js`, `alt-editor-lite-standalone.js.map`,
  `alt-editor-lite-standalone.min.js`, and
  `alt-editor-lite-standalone.min.js.map` for a DataTables-free standalone
  runtime;
- Browser Global language resources under `dist/umd/locales/`.

ESM entry points, declarations, and JSON language resources are published under
`dist/esm/`.

For self-hosting, copy the required `dist/` files and use equivalent local URLs:

<!-- prettier-ignore -->
```html
<link rel="stylesheet" href="/vendor/alt-editor-lite.min.css" />
<script src="/vendor/alt-editor-lite.min.js"></script>
```

`Editor`, `AltEditorLite`, `DataTablesHost`, `StandaloneHost`,
`defineCustomField`, the language loader, and the language registry are available
through `globalThis.AltEditorLite`. This main bundle requires DataTables to load
first and registers `table.altEditorLite()` as a retrieval-only method.
`AltEditorLite.Editor` is the DataTables constructor, while
`AltEditorLite.AltEditorLite` is the neutral Host-based constructor.

Standalone script users can instead load `alt-editor-lite-standalone.js` or its
minified counterpart and construct
`AltEditorLiteStandalone.StandaloneHost` with consumer record
callbacks. Both standalone files are published with source maps and neither
imports, registers, or requires DataTables. See [Standalone
usage](standalone.md) for the Host and record ownership contract.

The standalone global exposes `AltEditorLite`, `StandaloneHost`,
`AltEditorLiteError`, `EditorConfigurationError`, and `EditorTargetUnavailableError`.
It does not include the main global's language registry or custom field helper;
use the ESM entry for the complete neutral API.

Retain the package's `LICENSE` file when redistributing self-hosted assets.

## Languages

Included language registration bundles must load after the main browser bundle:

<!-- prettier-ignore -->
```html
<script src="https://cdn.jsdelivr.net/npm/datatables-alteditor-lite/dist/umd/locales/alt-editor-lite.ja.min.js"></script>
```

```js
const language = AltEditorLite.getLocale('ja');
const editor = new AltEditorLite.Editor(table, {
  fields,
  language,
});
```

Available locale filenames use `en`, `ja`, `zh-cn`, and `es`. A custom partial
JSON resource can be loaded without changing the library:

```js
const language = await AltEditorLite.loadEditorLanguage('./languages/fr-FR.json');
```

Evaluating the main bundle before DataTables throws a load-order error. Evaluating
an included language registration bundle before the main bundle also throws.
These diagnostics prevent silent partial initialization.

The repository demonstration uses the same Browser Global API with built
distribution files. GitHub Pages builds those files before deployment.
