# datatables-alteditor-lite

`datatables-alteditor-lite` is an independent, lightweight editing extension for
DataTables 3.x. It uses TypeScript and native browser APIs, with no jQuery or UI
framework runtime.

The current implementation provides the core native Create dialog and synchronous
client-side row creation. It is not yet published to npm.

## Current capabilities

- One editor instance per DataTables table
- Native `<dialog>` with keyboard focus containment and restoration
- Safe nested field paths with prototype-pollution protection
- Native constraints followed by asynchronous custom field validation
- Hidden, text, email, password, number, date, time, datetime-local, textarea,
  checkbox, radio, select, and single/multiple file fields
- Exact number, typed select/radio, and file value normalization
- English fallback language with nested overrides
- Non-bubbling DOM `CustomEvent` lifecycle notifications
- ESM and Browser Global registration without optional DataTables runtime imports

Edit, Remove, Refresh, asynchronous persistence, Buttons/Select behavior, and
SearchSelect are not implemented yet.

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
```

The getter never creates an instance:

```ts
table.altEditorLite<UserForm>(); // AltEditorLite<UserRow, UserForm> | null
```

Call `editor.destroy()` before replacing the DataTables table or creating another
editor for the same table.

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

## Events

Listen directly on `table.table().node()`. Events do not bubble and cannot cancel
operations.

```ts
const tableElement = table.table().node();

tableElement.addEventListener('alteditor-lite:success', (event) => {
  if (event instanceof CustomEvent) {
    console.log(event.detail.row);
  }
});
```

The implemented Create sequence is:

```text
open → submit → success | error → close (when closed)
```

`alteditor-lite:destroy` is emitted once after owned resources are cleaned up.

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
