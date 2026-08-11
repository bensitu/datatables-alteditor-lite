# Configuration

Create an editor explicitly for one initialized DataTables API instance:

```ts
const editor = new AltEditorLite<Row, FormValues>(table, {
  fields,
  operations,
  closeOnSuccess: true,
  language: {
    actions: {
      submit: 'Save',
    },
  },
});
```

One active editor can own a table element. The `table.altEditorLite()` method only
retrieves that instance; it never creates one.

## Options

`fields` is the ordered list used to build Create and Edit forms. Only declared
field paths can be written by the default Edit merge. Disabled fields are omitted.
Values normalized to `undefined` are omitted from the public values object. For
the built-in default Edit merge only, an enabled field that normalizes to
`undefined` is retained as an explicit clear; it is distinct from an omitted or
disabled field. Custom Update callbacks that need an explicit empty value should
configure a value such as `emptyValue: null`.

`operations` provides synchronous or asynchronous persistence callbacks:

- `create(values, context)` returns one complete row.
- `update(values, original, context)` returns one complete replacement row.
- `remove(rows, context)` resolves after persistence succeeds.
- `refresh(context)` optionally replaces the default table refresh behavior.

`clientSide` provides synchronous mappings:

- `createRow(values)` returns one complete row.
- `updateRow(original, values)` returns one complete replacement row.

Do not configure `operations.create` with `clientSide.createRow`, or
`operations.update` with `clientSide.updateRow`. Ambiguous ownership is rejected
during construction.

`closeOnSuccess` defaults to `true`. When `false`, successful Create and Edit
operations preserve the current form values and return the dialog to its open
state. Remove always closes after success because its captured targets no longer
exist.

`language` accepts complete language data or nested overrides of the built-in
English strings. Applications can define it inline or await `loadEditorLanguage`
for an external JSON resource before constructing the editor.

`editMode` selects the Edit presentation. It accepts `dialog` (the default),
`inlineDoubleClick`, or `inlineHover`. Dialog mode enables `openEditDialog()` and
does not accept an `inline` object. Inline modes enable programmatic single-cell
editing while making Dialog Edit unavailable.

`inline` supports `keyboardActivation`, exact named-column `columns` mappings,
`updateMode`, and a safe additional `className`. `inlineDoubleClick` also supports
`blurAction`, `enterAction`, and `tabAction`. `inlineHover` requires those actions
to be `none` when explicitly configured because its native Submit and Cancel
buttons own resolution. It is optional in Inline mode and rejected in Dialog
mode. See [Editing](editing.md).

`hooks` configures `beforeOpen`, `beforeSubmit`, `afterSuccess`, and `onError`.
See [Lifecycle hooks](hooks.md).

## Capabilities

Create is available only when `operations.create` or `clientSide.createRow` is
configured.

Edit resolves its implementation in this order:

1. `operations.update`
2. `clientSide.updateRow`
3. safe merge of collected values into declared field paths

Remove uses `operations.remove` when configured and otherwise removes the captured
rows locally after confirmation.

Refresh uses `operations.refresh` when configured. Otherwise, it uses the public
`ajax.reload` API for Ajax tables and `draw(false)` for local tables.

Inline Edit uses the same Update resolution as Dialog Edit. Refresh commit mode
requires both `operations.update` and `operations.refresh`.

## Optional extensions

Buttons and Select are optional peers. KeyTable and ColReorder are also detected
at runtime when applications install them; none are imported as production
requirements.

The maintained DataTables 3 compatibility coverage uses the following extension
release lines. Each entry is initialized with a real DataTable, performs a public
extension operation and an Edit operation, and verifies editor and table
destruction.

| Extension     | DataTables 3 release line | Verified operation                         |
| ------------- | ------------------------- | ------------------------------------------ |
| AutoFill      | 3.x                       | Disable and re-enable filling              |
| ColumnControl | 2.x                       | Replace SearchList options                 |
| Responsive    | 4.x                       | Rebuild breakpoints and recalculate widths |
| RowReorder    | 2.x                       | Disable and re-enable drag activation      |
| SearchBuilder | 2.x                       | Apply and clear predefined criteria        |

SearchPanes is not included because its currently published release line is not
compatible with DataTables 3. CardView is not part of this project's optional
test dependencies. These boundaries avoid loading an incompatible or separately
distributed extension solely for compatibility checks.

After a successful Create, Edit, or Remove operation, registered extensions with
derived table state are synchronized through their public APIs:

- `columns().columnControl.searchList('refresh')` reloads dynamic SearchList
  options.
- `responsive.recalc()` recalculates the Responsive layout.

The calls run after the Dialog presentation has returned to a stable state or the
Inline session has been unmounted. API detection is runtime-only; AltEditorLite
does not import either extension as a production dependency.

The registered button names are:

```text
altEditorLiteCreate
altEditorLiteEdit
altEditorLiteRemove
altEditorLiteRefresh
```

Without Select, Create and Refresh buttons still work. Edit and Remove buttons are
disabled with `aria-disabled` and a descriptive title. The instance APIs continue
to support explicit DataTables row selectors. Button labels and descriptive titles
come from the owning editor's resolved `language` object.

The Edit button is visible only in Dialog mode. In Inline mode its registered
global definition remains available to other tables, but the instance-specific
button is hidden, disabled, removed from keyboard navigation, and marked
`aria-hidden`. Create, Remove, and Refresh remain available when their normal
requirements are met. They safely cancel an active `inlineDoubleClick` cell.
During `inlineHover`, they stay unavailable until Submit or Cancel resolves the
current candidate.
