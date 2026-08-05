# Getting started

This guide begins with the default dialog workflow. See [Editing](editing.md) for
complete dialog behavior and optional single-cell editing.

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

## Editing and commit model

Dialog Edit and inline Edit use one persistence transaction. Presentation code
owns field rendering, validation feedback, focus, and cleanup. Shared operation
code owns request sequencing, target revalidation, lifecycle callbacks,
persistence selection, complete-row validation, DataTables mutation, draw
completion, and normalized failures.

The ordered update flow is:

1. validate and collect immutable values;
2. confirm the captured row and optional column identity;
3. run the veto-only `beforeSubmit` hook;
4. publish submit and invoke the configured update implementation;
5. confirm request ownership and target identity again;
6. commit one complete replacement row or run the configured refresh;
7. wait for the owned draw, publish success, and restore logical focus;
8. run `afterSuccess` without changing the committed result.

Validation and persistence failures leave canonical DataTables data unchanged.
Cancellation aborts owned work, and every asynchronous boundary ignores stale or
destroyed results. Row and cell identity fail closed instead of selecting another
target by displayed value.

If neither `operations.update` nor `clientSide.updateRow` is configured, Edit
uses the declared-field merge as a local-only update. Configure a persistence
callback when changes must be stored outside the current DataTables instance.

Persistence contexts identify the initiating `mode` as `dialog`, `inline`, or
`api`, and Edit contexts include a stable `target`. Lifecycle DOM events use the
same mode and target information. Policies that must decline opening or submission
belong in `beforeOpen` and `beforeSubmit`; DOM events remain observation-only.

Inline editing requires `inlineEdit: true` on eligible fields and
`inline: { enabled: true }` in editor options. It does not introduce a separate
field list, cell-specific persistence callback, optimistic row mutation, jQuery
API, or private DataTables setting.

## Rendered DataTables columns

`columns.render` and `columnDefs.render` may display derived markup, including
select and input elements. Editors still read the source value from the canonical
row object. After either dialog or inline submission, the complete row is replaced
and DataTables invokes the renderer again with the committed value.

Rendered interactive descendants do not trigger automatic inline activation.
Call `openInlineEdit(rowSelector, columnSelector)` from an application control
when a cell is occupied by a display control. See [Editing](editing.md) for the
complete rendered-control contract and safe renderer guidance.

## Supported environments

The package targets modern evergreen browsers with native `<dialog>`, including
the Chromium, Firefox, and WebKit engines exercised by the automated browser
suite.
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

See [Editing](editing.md), [API reference](api-reference.md), [Fields](fields.md),
[Operations](operations.md), [Localization](localization.md), and [Browser
Global](browser-global.md). A working Browser Global configuration is available
in the [live demo](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/).
