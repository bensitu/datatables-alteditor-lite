# Getting started

## Install

Install DataTables 3 and AltEditorLite. Buttons and Select are optional peers:

```bash
npm install datatables.net@^3 datatables-alteditor-lite
npm install datatables.net-buttons@^4 datatables.net-select@^4
```

DataTables' published TypeScript declarations reference jQuery types for its
optional compatibility API. Projects that type-check dependencies with
`skipLibCheck: false` must also install the type-only package; it does not add a
runtime dependency:

```bash
npm install --save-dev @types/jquery
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

The browser runtime requires these native platform capabilities:

| Capability                              | Used for                              |
| --------------------------------------- | ------------------------------------- |
| `<dialog>` and `::backdrop`             | Modal rendering and focus containment |
| `AbortController` and `AbortSignal.any` | Operation and validation cancellation |
| `Object.hasOwn`                         | Safe form-value path traversal        |
| ES modules and modern `CustomEvent`     | Package loading and lifecycle events  |

No compatibility polyfills are bundled. Applications that support older browser
engines must provide these capabilities before initializing the editor. The CSS
includes viewport-unit and color fallbacks for engines that lack `dvh` or
`color-mix()` while supporting the required JavaScript APIs.

The package metadata defines the supported DataTables, Buttons, and Select peer
ranges. Development uses compatible releases resolved by the lockfile without
requiring one exact patch version at runtime.

See [Fields](fields.md), [Operations](operations.md),
[Localization](localization.md), and [Browser Global](browser-global.md). A working
Browser Global configuration is available in the
[live demo](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/).
