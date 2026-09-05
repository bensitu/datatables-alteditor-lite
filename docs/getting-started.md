# Getting started

This guide begins with the default dialog workflow. See [Editing](editing.md) for
complete dialog behavior and optional single-cell editing.

## Install

Install AltEditorLite by itself for neutral or standalone use. Add DataTables 3
for the DataTables integration; Buttons and Select are optional peers:

```bash
npm install datatables-alteditor-lite
npm install datatables.net@^3 datatables-alteditor-lite
npm install datatables.net-buttons@^4 datatables.net-select@^4
```

DataTables is marked as an optional peer so applications using the neutral root
or `/standalone` entry do not install it. Applications importing `/datatables`
must install a compatible DataTables runtime.

DataTables' published TypeScript declarations reference jQuery types for its
optional compatibility API. Projects that type-check dependencies with
`skipLibCheck: false` must also install the type-only package; it does not add a
runtime dependency:

```bash
npm install --save-dev @types/jquery
```

Import DataTables, its explicit auto-registering integration entry, and the
stylesheet:

```ts
import DataTable from 'datatables.net';
import { AltEditorLite } from 'datatables-alteditor-lite/datatables';
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

Each line below is an independent action to connect to an application control.
Explicit selectors do not require the Select extension:

```ts
await editor.openEditDialog('#user-1');
await editor.openBatchEditDialog(['#user-1', '#user-2']);
await editor.openRemoveDialog('#user-1');
await editor.refresh();
```

The `/datatables` entry registers against its imported DataTables runtime. The
root entry is host-neutral and does not import or register DataTables.
`registerAltEditorLite(DataTable)` remains available from `/datatables` for an
application that deliberately supplies another compatible constructor; repeated
registration is safe.

`TRow` is the complete DataTables row shape. `TFormValues` is the independent
shape collected from configured fields. Persistence callbacks convert form values
to complete rows; the library never assumes that the two shapes are identical.

Use `table.altEditorLite<UserForm>()` only to retrieve an existing instance. It
never constructs one. Call `editor.destroy()` before replacing the table or
creating another editor for the same table element.

The `/datatables` `AltEditorLite` export accepts public DataTables row and column
selectors. Applications that want the neutral root constructor can retain the
Host explicitly:

```ts
import { AltEditorLite as CoreEditor } from 'datatables-alteditor-lite';
import {
  DataTablesHost,
  type DataTablesRecordTarget,
} from 'datatables-alteditor-lite/datatables';

const host = new DataTablesHost(table);
const editor = new CoreEditor<UserRow, UserForm, DataTablesRecordTarget>(host, {
  fields,
});
const dataTablesApi = host.unwrap();
```

`unwrap()` is an explicit DataTables escape hatch. Operation, validation, hook,
and event contexts remain host-neutral and never receive this API implicitly.

## Standalone setup

The standalone host delegates record state to consumer callbacks:

```ts
import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';

const records = new Map<string, UserRow>();
const host = new StandaloneHost<UserRow, string>({
  read: (target) => {
    const row = records.get(target);
    if (row === undefined) throw new Error('Record unavailable.');
    return row;
  },
  applyUpdate: (target, row) => {
    records.set(target, row);
    return target;
  },
});
const editor = new AltEditorLite<UserRow, UserForm, string>(host, { fields });
```

Supply `applyCreate` and `applyRemove` when those operations are used. The
optional `refresh` callback defines the work performed by `editor.refresh()`;
without it, the call completes without changing records. Local uniqueness fields
also require `records`, an iterable provider returning `{ target, row }` entries.
Lifecycle events use `host.eventTarget`; provide one when another application
component needs to observe them. See [Standalone usage](standalone.md) for the
complete Host callback and cleanup contract.

## Editing and commit model

Dialog Edit and inline Edit use one persistence transaction. Presentation code
owns field rendering, validation feedback, focus, and cleanup. Shared operation
code owns request sequencing, target revalidation, lifecycle callbacks,
persistence selection, complete-row validation, Host application, stable
presentation completion, and normalized failures.

The ordered update flow is:

1. validate and collect immutable values;
2. confirm the captured row and optional column identity;
3. run the veto-only `beforeSubmit` hook;
4. publish submit and invoke the configured update implementation;
5. confirm request ownership and target identity again;
6. ask the Host to apply one complete replacement row or run its refresh;
7. wait for stable Host presentation, publish success, and restore logical focus;
8. run `afterSuccess` without changing the committed result.

Validation and persistence failures leave canonical Host data unchanged.
Cancellation aborts owned work, and every asynchronous boundary ignores stale or
destroyed results. Row and cell identity fail closed instead of selecting another
target by displayed value.

If neither `operations.update` nor `clientSide.updateRow` is configured, Edit
uses the declared-field merge as a local-only update. Configure a persistence
callback when changes must be stored outside the current Host.

Persistence contexts identify the initiating `mode` as `dialog`, `inline`, or
`api`, and Edit contexts include a stable `target`. Lifecycle DOM events use the
same mode and target information. Policies that must decline opening or submission
belong in `beforeOpen` and `beforeSubmit`; DOM events remain observation-only.

Inline editing requires `editing.inline.enabled: true` and `inlineEdit: true` on
at least one eligible field. The same `editing` object independently configures
Dialog Edit, so an editor can provide either presentation or both:

```ts
editing: {
  dialog: { enabled: true },
  inline: { activation: 'doubleClick', enabled: true },
},
```

Double-click activation provides fast mouse and touch behavior. Hover activation
provides a pencil, explicit Submit/Cancel actions, and focused-cell keyboard
activation when KeyTable is present. Create, Remove, Refresh, and Dialog Edit
cancel a double-click session, but require a hover session to be explicitly
resolved first. Inline editing does not introduce a separate field list,
cell-specific persistence callback, optimistic row mutation, jQuery API, or
private DataTables setting.

## Rendered DataTables columns

`columns.render` and `columnDefs.render` may display derived markup, including
select and input elements. Editors still read the source value from the canonical
row object. After either dialog or inline submission, the complete row is replaced
and DataTables invokes the renderer again with the committed value.

Rendered interactive descendants do not trigger automatic inline activation.
Call `openInlineEdit(rowSelector, columnSelector)` from an application control
when a cell is occupied by a display control. See [Editing](editing.md) for the
complete rendered-control contract and safe renderer guidance.

An application may also treat a rendered control as an editing shortcut. Handle
its change event, resolve the owning cell through the public DataTables API, and
route the requested value through the editor presentation selected for that table.
The live demo includes Hybrid Dialog and Inline editing, hover activation, and
rendered controls; the renderer itself never becomes the canonical data source.

Inline validation, change-callback, persistence, commit, and target errors use a
plain-text modal alert. The current candidate remains in the cell. Closing the
alert restores the current input when possible and allows correction or retry;
it does not close the Inline session or publish an additional close event.

## Supported environments

The package targets modern evergreen browsers with native `<dialog>`, including
the Chromium, Firefox, and WebKit engines exercised by the automated browser
suite, plus mobile Chromium and phone/tablet WebKit touch profiles.
The published Node engine range applies to installation, builds, and server-side
tooling; the runtime itself is browser code.

The browser runtime requires these native platform capabilities:

| Capability                          | Used for                                  |
| ----------------------------------- | ----------------------------------------- |
| `<dialog>` and `::backdrop`         | Modal rendering and focus containment     |
| `AbortController`                   | Operation and validation cancellation     |
| ES modules and modern `CustomEvent` | Package loading and lifecycle events      |
| ES2022 JavaScript APIs              | Native object, string, and error handling |
| `inert` and CSS `:has()`            | Busy-state interaction and focus styling  |

No compatibility polyfills are bundled. Applications that support older browser
engines must provide these capabilities before initializing the editor. The CSS
includes viewport-unit and color fallbacks for engines that lack `dvh` or
`color-mix()` while supporting the required JavaScript APIs.

The package metadata defines the supported DataTables, Buttons, and Select peer
ranges. Development uses compatible releases resolved by the lockfile without
requiring one exact patch version at runtime.

See [Editing](editing.md), [Dynamic forms](forms.md), [API
reference](api-reference.md), [Fields](fields.md), [Operations](operations.md),
and [Localization](localization.md). The [Browser
Global guide](browser-global.md) includes a complete jsDelivr quick start, while
the [live demo](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/)
shows both editing presentations and rendered-control integration.
