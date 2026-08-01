# datatables-alteditor-lite

`datatables-alteditor-lite` is an independent, lightweight editing extension for
DataTables 3.x. It uses TypeScript and native browser APIs, with no jQuery or UI
framework runtime.

It provides Create, Edit, Remove, and Refresh with
synchronous client-side mappings or asynchronous persistence operations.

## Features

- One editor instance per DataTables table
- Native `<dialog>` with keyboard focus containment and restoration
- Safe nested field paths with prototype-pollution protection
- Native constraints followed by asynchronous custom field validation
- Optional local uniqueness checks against the rows currently loaded by DataTables
- Hidden, text, email, password, number, date, time, datetime-local, textarea,
  checkbox, radio, select, SearchSelect, and single/multiple file fields
- Local single-value SearchSelect with exact string/number identity, dynamic
  options, keyboard/IME support, clear, sorting, and optional manual strings
- Exact number, typed option, and file value normalization
- English fallback with nested overrides, independently loadable JSON language
  resources, and ESM modules for English, Japanese, Simplified Chinese, and Spanish
- Non-bubbling DOM `CustomEvent` lifecycle notifications
- Non-optimistic asynchronous Create, Update, and Remove operations with
  `AbortSignal`
- Edit and Remove target snapshots that survive selection changes and redraws
- Explicit DataTables row selectors with optional Select integration
- Optional Buttons definitions with localized labels, titles, and lifecycle-aware
  enablement
- Ajax-aware and local-table Refresh
- ESM and Browser Global registration without optional DataTables runtime imports
- Browser Global language registry and optional registration bundles
- Responsive light/dark CSS with reduced-motion and high-zoom support

## ESM usage

Importing the package registers the retrieval-only DataTables API method. Instances
are still created explicitly.

```ts
import DataTable from 'datatables.net';
import { AltEditorLite, type EditorValues } from 'datatables-alteditor-lite';
import 'datatables-alteditor-lite/style.css';

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
}

interface UserForm {
  readonly name: string;
  readonly rank: number;
}

const table = new DataTable<UserRow>('#users', {
  columns: [{ data: 'name' }, { data: 'rank' }],
  data: [],
  rowId: 'id',
});

const editor = new AltEditorLite<UserRow, UserForm>(table, {
  fields: [
    {
      label: 'Name',
      name: 'name',
      required: true,
      type: 'text',
    },
    {
      attributes: { min: '1' },
      label: 'Rank',
      name: 'rank',
      required: true,
      type: 'number',
    },
  ],
  clientSide: {
    createRow(values: Readonly<EditorValues<UserForm>>): UserRow {
      return {
        id: crypto.randomUUID(),
        name: values.name ?? '',
        rank: values.rank ?? 1,
      };
    },
  },
});

document.querySelector('#create-user')?.addEventListener('click', () => {
  void editor.openCreateDialog();
});

document.querySelector('#edit-user')?.addEventListener('click', () => {
  void editor.openEditDialog('#user-42');
});

document.querySelector('#remove-user')?.addEventListener('click', () => {
  void editor.openRemoveDialog('#user-42');
});
```

The getter never creates an instance:

```ts
table.altEditorLite<UserForm>(); // AltEditorLite<UserRow, UserForm> | null
```

Call `editor.destroy()` before replacing the DataTables table or creating another
editor for the same table.

For remote persistence, use `operations.create`, `operations.update`, and
`operations.remove`. DataTables changes only after the callback succeeds. See
[Operations](docs/operations.md), [Configuration](docs/configuration.md), and
[Fields](docs/fields.md).

Buttons and Select remain optional peer dependencies. If Buttons is loaded before
AltEditorLite registration, these definitions are available:

```text
altEditorLiteCreate
altEditorLiteEdit
altEditorLiteRemove
altEditorLiteRefresh
```

Edit and Remove can always use an explicit row selector. Omitting the selector
requires Select.

## Browser Global usage

Load DataTables first, followed by the stylesheet and AltEditorLite bundle:

```html
<link rel="stylesheet" href="alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="datatables-alteditor-lite.js"></script>
```

The constructor is available as
`DataTablesAltEditorLite.AltEditorLite`. Repeated evaluation of the browser bundle
does not register the DataTables method again.

Language registration bundles load after the main browser bundle:

```html
<script src="datatables-alteditor-lite.js"></script>
<script src="locales/datatables-alteditor-lite.ja.js"></script>
```

```js
const language = DataTablesAltEditorLite.getLocale('ja');
```

Applications can also load their own JSON language resource without modifying or
rebuilding AltEditorLite:

```js
const language = await DataTablesAltEditorLite.loadEditorLanguage(
  './languages/fr-FR.json',
);
```

See [Localization](docs/localization.md) and
[Browser Global](docs/browser-global.md) for all published paths and load order.

## Events

Listen directly on `table.table().node()`. Events do not bubble and cannot cancel
operations.

```ts
const tableElement = table.table().node();

tableElement.addEventListener('alteditor-lite:success', (event) => {
  if (event instanceof CustomEvent) {
    console.log(event.detail.operation);
  }
});
```

The Create, Edit, and Remove sequence is:

```text
open → submit → success | error → close (when closed)
```

Refresh publishes `refresh(start) → success | error → refresh(complete)`.
`alteditor-lite:destroy` is emitted once after owned resources are cleaned up.
See [Events](docs/events.md) for the discriminated detail types.

## Demonstration

The static example uses built distribution files and the official DataTables CDN.
Build it before opening `examples/demo/index.html` with a local static server:

```bash
npm run build
```

`npm run demo` is available as a local preview helper. The GitHub Pages workflow
builds `dist/` and publishes only the example and its required distribution files.
The page demonstrates CRUD, optional Buttons and Select integration, typed
SearchSelect, external JSON languages, asynchronous failures, events, and multiple
independent instances.

## Development

Use a supported Node.js version and install the exact dependency graph:

```bash
npm ci
```

Run the repository checks:

```bash
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions.
