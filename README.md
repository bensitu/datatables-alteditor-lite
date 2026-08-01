# datatables-alteditor-lite

`datatables-alteditor-lite` is an independent, lightweight editing extension for
DataTables 3.x. It uses TypeScript and native browser APIs, with no jQuery or UI
framework runtime.

The current implementation provides Create, Edit, Remove, and Refresh with
synchronous client-side mappings or asynchronous persistence operations.

## Current capabilities

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
- English fallback with nested overrides and published English, Japanese,
  Simplified Chinese, and Spanish locale modules
- Non-bubbling DOM `CustomEvent` lifecycle notifications
- Non-optimistic asynchronous Create, Update, and Remove operations with
  `AbortSignal`
- Edit and Remove target snapshots that survive selection changes and redraws
- Explicit DataTables row selectors with optional Select integration
- Optional Buttons definitions with localized labels, titles, and lifecycle-aware
  enablement
- Ajax-aware and local-table Refresh
- ESM and Browser Global registration without optional DataTables runtime imports
- Browser Global locale registry and minified/source-mapped locale bundles
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

Locale IIFEs load after the core and register through its public registry:

```html
<script src="datatables-alteditor-lite.js"></script>
<script src="locales/datatables-alteditor-lite.ja.js"></script>
```

```js
const language = DataTablesAltEditorLite.getLocale('ja');
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

## Public demo

The Browser Global demo uses the built `dist/` files and official CDN builds for
DataTables and its optional peers:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173/`. It demonstrates full CRUD, Buttons and Select,
typed SearchSelect, asynchronous failures, four locales, events, state, and a
second independent instance.

## Development

Use a supported Node.js version and install the exact dependency graph:

```bash
npm ci
```

Run the complete repository verification:

```bash
npm run ci:core
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions and documentation
governance.
