---
audience: public
status: stable
---

# Getting started

## Install

Install DataTables 3 and AltEditorLite. Buttons and Select are optional peers:

```bash
npm install datatables.net@^3 datatables-alteditor-lite
npm install datatables.net-buttons@^4 datatables.net-select@^4
```

Import DataTables, the auto-registering ESM entry, and the stylesheet:

```ts
import DataTable from 'datatables.net';
import { AltEditorLite } from 'datatables-alteditor-lite';
import 'datatables-alteditor-lite/style.css';

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly officeId: number;
}

interface UserForm {
  readonly name: string;
  readonly officeId: number;
}

const table = new DataTable<UserRow>('#users', {
  columns: [{ data: 'name' }, { data: 'officeId' }],
  data: [],
  rowId: 'id',
});

const editor = new AltEditorLite<UserRow, UserForm>(table, {
  clientSide: {
    createRow: (values) => ({
      id: crypto.randomUUID(),
      name: values.name ?? '',
      officeId: values.officeId ?? 1,
    }),
  },
  fields: [
    { label: 'Name', name: 'name', required: true, type: 'text' },
    {
      label: 'Office',
      name: 'officeId',
      options: [{ label: 'Tokyo', value: 1 }],
      type: 'search-select',
    },
  ],
});

document.querySelector('#create')?.addEventListener('click', () => {
  void editor.openCreateDialog();
});
```

`TRow` is the complete DataTables row shape. `TFormValues` is the independent
shape collected from configured fields. Persistence callbacks convert form values
to complete rows; the library never assumes that the two shapes are identical.

Use `table.altEditorLite<UserForm>()` only to retrieve an existing instance. It
never constructs one. Call `editor.destroy()` before replacing the table or
creating another editor for the same table element.

## Supported environments

The package targets modern evergreen browsers with native `<dialog>`, including
the Chromium, Firefox, and WebKit versions exercised by the release test suite.
The published Node engine range applies to installation, builds, and server-side
tooling; the runtime itself is browser code.

See [Fields](fields.md), [Operations](operations.md),
[Localization](localization.md), and [Browser Global](browser-global.md).
