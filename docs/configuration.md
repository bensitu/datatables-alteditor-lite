# Configuration

Create one editor for an `EditorHost`. DataTables applications normally use the
selector-friendly facade from the explicit integration entry, which registers
the retrieval API and optional Buttons integration automatically.

```ts
import { AltEditorLite } from 'datatables-alteditor-lite/datatables';

const editor = new AltEditorLite<Row, FormValues>(table, {
  editing: {
    dialog: {
      closeOnSuccess: true,
      enabled: true,
    },
    inline: {
      activation: 'doubleClick',
      enabled: true,
    },
  },
  fields,
  operations,
});
```

One active editor can own a table element. `table.altEditorLite()` only retrieves
that instance; it never creates one.

The neutral form is `new AltEditorLite(host, options)`. An `EditorHost` supplies
record reads, canonical Create/Edit/Remove application, a stable ownership key,
an event target, and cleanup. Optional capabilities add selection, refresh,
record enumeration, presentation notifications, or inline behavior. The root
entry exports this neutral API without importing DataTables.

`DataTablesHost` implements the relevant capabilities for DataTables. Its
`unwrap()` method returns the owned DataTables API only when application code
intentionally needs an integration-specific escape hatch. `StandaloneHost`
delegates storage and refresh work to consumer callbacks and is exported from
`datatables-alteditor-lite/standalone`.

## Options

| Property       | Required | Description                                                           |
| -------------- | -------- | --------------------------------------------------------------------- |
| `fields`       | Yes      | Ordered field definitions shared by Create and editing presentations. |
| `editing`      | No       | Composable Dialog Edit and Inline Edit behavior.                      |
| `operations`   | No       | Asynchronous or synchronous persistence callbacks.                    |
| `clientSide`   | No       | Synchronous Create and Update row mappings.                           |
| `dependencies` | No       | Declarative Dialog field-state resolvers.                             |
| `validateForm` | No       | Cross-field validator used by Create and editing presentations.       |
| `language`     | No       | Complete language data or nested overrides merged with English.       |
| `hooks`        | No       | Lifecycle veto and observation callbacks.                             |

Only declared field paths can be written by the built-in Edit merge. Disabled
fields are omitted from collected values. A value normalized to `undefined` is
omitted from the public values object, while the built-in Edit merge retains an
enabled field's explicit `undefined` as a clear operation. Configure a concrete
empty value such as `emptyValue: null` when a custom Update callback must receive
one.

## Editing options

Dialog and Inline editing are independent capabilities. Omitting `editing`
enables Dialog Edit and disables Inline Edit.

### `editing.dialog`

| Property         | Default | Description                                                                              |
| ---------------- | ------- | ---------------------------------------------------------------------------------------- |
| `enabled`        | `true`  | Enables single- and multi-record Dialog Edit when their Host capabilities are available. |
| `template`       | none    | Selector or consumer-owned element cloned for every Create or Edit form.                 |
| `closeOnSuccess` | `true`  | Closes successful Create and Dialog Edit forms.                                          |

`template` and `closeOnSuccess` also affect Create forms even when Dialog Edit is
disabled. Remove always closes after success because its captured rows no longer
exist.

### `editing.inline`

| Property             | Default             | Description                                                                 |
| -------------------- | ------------------- | --------------------------------------------------------------------------- |
| `enabled`            | `false`             | Makes eligible single-cell editing available.                               |
| `activation`         | `'doubleClick'`     | Uses double-click/tap or `'hover'` pencil activation.                       |
| `blurAction`         | `'submit'`          | Double-click session behavior: `'submit'`, `'cancel'`, or `'none'`.         |
| `enterAction`        | `'submit'`          | Double-click single-line behavior: `'submit'` or `'none'`.                  |
| `tabAction`          | `'submit-and-move'` | Double-click behavior: submit and move, submit, or no editor action.        |
| `columns`            | `{}`                | Exact named-column mapping to field paths; `false` disables a named column. |
| `updateMode`         | `'replace-row'`     | Commits a complete row or uses consumer-owned `'refresh'`.                  |
| `className`          | none                | Safe additional class tokens applied to the Inline host.                    |
| `keyboardActivation` | `{ key: 'F2' }`     | KeyTable-focused-cell shortcut, a custom shortcut, or `false`.              |

Hover sessions use their native Submit and Cancel buttons, and Escape cancels
without saving. If `blurAction`, `enterAction`, or `tabAction` is explicitly
configured for hover activation, its value must be `'none'`.

`keyboardActivation: false` disables only focused-cell activation. It does not
disable keyboard behavior inside an open session: native controls keep their
keys, and the configured double-click or hover interaction policy still applies.

Inline editing requires at least one supported field with `inlineEdit: true`.
Automatic mapping first uses an exact `column().dataSrc()` and field-path match.
`editing.inline.columns` can instead map one unique DataTables column name to a
field or disable that column:

```ts
editing: {
  inline: {
    columns: {
      actions: false,
      displayName: 'profile.name',
      salary: 'salary',
    },
    enabled: true,
  },
},
```

`updateMode: 'refresh'` requires both `operations.update` and
`operations.refresh`. In that mode, the application owns the DataTables mutation.

## Capability matrix

| Configuration                   | Dialog Edit | Inline Edit | Create / Remove / Refresh                        |
| ------------------------------- | ----------- | ----------- | ------------------------------------------------ |
| Omitted `editing`               | Available   | Unavailable | Available when their normal requirements are met |
| Dialog enabled, Inline disabled | Available   | Unavailable | Available                                        |
| Dialog disabled, Inline enabled | Unavailable | Available   | Available                                        |
| Dialog enabled, Inline enabled  | Available   | Available   | Available                                        |
| Both disabled                   | Unavailable | Unavailable | Available                                        |

Create additionally requires `operations.create` or `clientSide.createRow`.
Dialog and Inline Edit share the same Update implementation and can coexist on
one editor. An active dialog owns the editor interaction, so Inline activation is
rejected until it closes. See [Editing](editing.md) for the different
double-click and hover conflict policies.

Multi-record Dialog Edit additionally requires a Host with
`HostBatchUpdateCapability`. It is available when `operations.updateMany` is
configured, or when no `operations.update` owns persistence and the editor can
use `clientSide.updateRow` or the safe merge. A single-record `operations.update`
callback is never invoked once per selected record.

## Dynamic forms and validation

`dependencies` maps a rendered Dialog source field to a synchronous or
asynchronous resolver. The resolver receives an immutable values snapshot and an
`AbortSignal`, then returns declarative changes to target fields:

```ts
dependencies: defineFormDependencies<FormValues>()({
  country: (country) => ({
    prefecture: {
      options:
        country === 'JP'
          ? [
              { label: 'Tokyo', value: 'tokyo' },
              { label: 'Osaka', value: 'osaka' },
            ]
          : [],
      required: country === 'JP',
      value: undefined,
      visible: country === 'JP',
    },
  }),
}),
```

`validateForm(values, context)` runs after field and local uniqueness validation.
It can return typed field errors and a submission-level message:

```ts
validateForm: (values) =>
  values.endDate !== undefined && values.endDate < values.startDate
    ? {
        fieldErrors: { endDate: 'End date must not precede start date.' },
        message: 'Review the schedule.',
        valid: false,
      }
    : { valid: true },
```

The same validator contract runs for Dialog Create, single Dialog Edit,
multi-record Dialog Edit, and Inline Edit. Multi-record validation runs once per
effective record after common changes are overlaid. Dialog dependencies do not
run for Inline sessions. See [Dynamic forms](forms.md)
for template ownership, dependency ordering, cancellation, and error behavior.

## Persistence and hooks

`operations` supports:

- `create(values, context)`, which returns one complete row;
- `update(values, original, context)`, which returns one complete replacement row;
- `updateMany(changes, originals, context)`, which returns ordered complete rows;
- `remove(rows, context)`, which resolves after persistence succeeds;
- `refresh(context)`, which optionally replaces the default refresh behavior.

`clientSide.createRow(values)` and `clientSide.updateRow(original, values)` are
synchronous alternatives. Do not configure `operations.create` with
`clientSide.createRow`, or `operations.update` with `clientSide.updateRow`.
Ambiguous ownership is rejected during construction.

Edit resolves its implementation in this order:

1. `operations.update`;
2. `clientSide.updateRow`;
3. safe merge into declared field paths.

Multi-record Edit resolves `operations.updateMany` first, then applies
`clientSide.updateRow(original, changes)` to each original, then uses the safe
merge. `changes` contains overrides only.

Remove uses `operations.remove` before asking the Host to remove captured records.
Refresh uses `operations.refresh` or the configured Host's default behavior.
`DataTablesHost` uses public `ajax.reload` for Ajax tables and `draw(false)` for
local tables; `StandaloneHost` invokes its optional `refresh` callback.

`hooks` configures `beforeOpen`, `beforeSubmit`, `afterSuccess`, and `onError`.
See [Lifecycle hooks](hooks.md). `language` accepts complete language data or
nested overrides, including data loaded through `loadEditorLanguage`.

## Optional extensions

Buttons and Select are optional peers. KeyTable and ColReorder are detected when
installed; none are production dependencies. The registered Buttons names are:

```text
altEditorLiteCreate
altEditorLiteEdit
altEditorLiteRemove
altEditorLiteRefresh
```

Without Select, Create and Refresh buttons still work. Edit and Remove buttons
need selection only when their APIs are invoked without explicit row selectors.
The Edit button opens single Edit for one selected row and multi-record Edit for
two or more selected rows. It is disabled for several rows when the editor lacks
multi-record capability.

After a successful Create, Edit, or Remove, detected extensions with derived
table state are synchronized through public APIs. ColumnControl SearchList
options are refreshed and Responsive recalculates its layout after the editor
presentation reaches a stable state.

## Migrating from v0.6.x

v0.7.0 adds custom fields and asynchronous Host reads without changing existing
field configuration or synchronous Host behavior.

Existing v0.6.1 consumers do not require mandatory source changes.

- `EditorHost.read` and `StandaloneHostOptions.read` may now return a
  promise-like record and receive an optional `HostReadContext`. Existing
  synchronous one-argument callbacks remain assignable and behave as before.
- `FieldConfig<TFormValues>` now includes typed configurations created by
  `defineCustomField()`. Application code with an exhaustive field-type switch
  must handle `type: 'custom'`.
- Custom fields are Dialog-capable by default and must explicitly opt into
  multi-record or Inline Edit. Existing built-in field defaults are unchanged.
- `batchEditable: false` can omit any otherwise eligible field from
  multi-record editing. File, unique, hidden, and non-editable restrictions are
  unchanged.

## Migrating from v0.5.x

v0.6.0 standardized the DataTables facade and Browser Global names. The previous
names are not retained as runtime aliases.

| v0.5.x Browser or ESM API                      | v0.6.x API                           |
| ---------------------------------------------- | ------------------------------------ |
| `DataTablesEditor` from `/datatables`          | `AltEditorLite` from `/datatables`   |
| `globalThis.DataTablesAltEditorLite`           | `globalThis.AltEditorLite`           |
| `DataTablesAltEditorLite.DataTablesEditor`     | `AltEditorLite.Editor`               |
| `globalThis.DataTablesAltEditorLiteStandalone` | `globalThis.AltEditorLiteStandalone` |
| `dist/umd/datatables-alteditor-lite*.js`       | `dist/umd/alt-editor-lite*.js`       |
| `locales/datatables-alteditor-lite.*.js`       | `locales/alt-editor-lite.*.js`       |

## Migrating from v0.4.1

v0.5.0 made Host ownership explicit and removed the former DataTables-specific
shape from neutral APIs. v0.6.x uses the same `AltEditorLite` constructor name
for the neutral root and the selector-friendly `/datatables` entry; the import
path determines which constructor contract is used.

| v0.4.1                                        | v0.6.x API                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `new AltEditorLite(table, options)`           | Use `/datatables` with a table, or the neutral root with a Host      |
| `context.table`                               | Retain `DataTablesHost` and call `host.unwrap()` in integration code |
| `refreshTable()`                              | `refresh()`                                                          |
| Neutral methods accepted DataTables selectors | Use the `/datatables` facade or targets created by a Host            |
| Root import registered DataTables             | Import `datatables-alteditor-lite/datatables` explicitly             |

`OperationContext`, `AfterSuccessContext`, and `FormValidationContext` no
longer contain `table`. Operation and event targets now expose neutral `key` and
`fieldNames` information. DataTables-specific selector details remain available
through the `/datatables` facade and its detailed inline state type.

The DataTables integration still registers `table.altEditorLite()` as a
retrieval-only method. It returns the current editor or `null`; it never creates
an editor.

## Migrating from v0.3.1

v0.4.0 uses composable editing and structured SearchSelect options. Removed
properties do not have compatibility aliases.

```ts
// v0.3.1
{
  closeOnSuccess: false,
  editMode: 'inlineDoubleClick',
  inline: { columns: { salary: 'salary' } },
}

// v0.4.0 and later
{
  editing: {
    dialog: { closeOnSuccess: false, enabled: true },
    inline: {
      activation: 'doubleClick',
      columns: { salary: 'salary' },
      enabled: true,
    },
  },
}
```

Field and SearchSelect changes are direct replacements:

| v0.3.1                            | v0.4.0 and later                                |
| --------------------------------- | ----------------------------------------------- |
| `readonly`                        | `readOnly`                                      |
| `searchThreshold`                 | `search.threshold`                              |
| `debounceMs`                      | `search.debounceMs`                             |
| `loadOptions` and `resolveOption` | `remote.loadOptions` and `remote.resolveOption` |

```ts
// v0.4.0 remote SearchSelect
{
  label: 'Office',
  name: 'officeId',
  remote: {
    loadOptions: (query, context) => searchOffices(query, context.signal),
    resolveOption: (value, context) => getOffice(value, context.signal),
  },
  search: { debounceMs: 250, threshold: 2 },
  type: 'search-select',
}
```
