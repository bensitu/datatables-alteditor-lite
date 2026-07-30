---
audience: public
status: stable
---

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
field paths can be written by the default Edit merge. Disabled fields and values
normalized to `undefined` are omitted.

`operations` provides synchronous or asynchronous persistence callbacks:

- `create(values, context)` returns one complete row.
- `update(values, original, context)` returns one complete replacement row.
- `remove(rows, context)` resolves after persistence succeeds.

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

`language` is a nested partial override of the built-in English strings.

## Capabilities

Create is available only when `operations.create` or `clientSide.createRow` is
configured.

Edit resolves its implementation in this order:

1. `operations.update`
2. `clientSide.updateRow`
3. safe merge of collected values into declared field paths

Remove uses `operations.remove` when configured and otherwise removes the captured
rows locally after confirmation.

Refresh uses the public `ajax.reload` API for Ajax tables and `draw(false)` for
local tables.

## Optional extensions

Buttons and Select are optional peers and are never imported as runtime
requirements.

The registered button names are:

```text
altEditorLiteCreate
altEditorLiteEdit
altEditorLiteRemove
altEditorLiteRefresh
```

Without Select, Create and Refresh buttons still work. Edit and Remove buttons are
disabled with `aria-disabled` and a descriptive title. The instance APIs continue
to support explicit DataTables row selectors.
