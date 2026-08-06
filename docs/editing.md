# Editing

AltEditorLite provides complete-form Dialog editing and compact editing for one
cell at a time. Set one `editMode` for each editor instance. Both presentations
use the same non-optimistic update transaction and are mutually exclusive with
other operations on the owned table.

| `editMode`          | Dialog Edit | Double-click Inline Edit |
| ------------------- | ----------- | ------------------------ |
| `dialog` (default)  | Available   | Unavailable              |
| `inlineDoubleClick` | Unavailable | Available                |

Create, Remove, and Refresh remain available in both modes when their normal
requirements are met. `inlineHover` and other mode names are not accepted.

## Dialog editing

Dialog Create and Remove are available in either mode. Dialog Edit requires
`editMode: 'dialog'`. These workflows are available through the public methods or
the optional DataTables Buttons integration:

```ts
await editor.openCreateDialog();
await editor.openEditDialog('#user-42');
await editor.openRemoveDialog(['#user-42', '#user-43']);
await editor.closeDialog();
```

An explicit row selector does not require Select. When the Edit selector is
omitted, Select must identify exactly one row. Remove accepts one or more explicit
or selected rows and always presents a confirmation dialog.

Create and Edit render every configured visible field. Dialog editing supports
all field types, including password, radio, file, and hidden values that are not
appropriate for single-cell editing. Native constraints, custom validators,
local uniqueness, lifecycle hooks, persistence, and safe error normalization run
before DataTables is changed.

The dialog keeps the originally captured Edit row even if selection later
changes. It revalidates that identity before submission and again after
asynchronous persistence. Successful updates replace the complete row, wait for
the DataTables draw, close according to configuration, and restore focus to a
connected logical target.

## Inline editing

Inline editing requires `editMode: 'inlineDoubleClick'` and at least one eligible
field with `inlineEdit: true`:

```ts
const editor = new AltEditorLite<UserRow, UserValues>(table, {
  editMode: 'inlineDoubleClick',
  fields: [
    {
      inlineEdit: true,
      label: 'Display name',
      name: 'profile.name',
      required: true,
      type: 'text',
    },
  ],
});
```

The `inline` object is optional and configures behavior only. Supplying it in
Dialog mode is a configuration error. A field may keep `inlineEdit: true` in
Dialog mode; the flag is ignored until an Inline editor is constructed.

An eligible field must also be editable, enabled, visible, writable, supported by
inline editing, and mapped to an available visible column.

Supported fields are `text`, `email`, `number`, `date`, `time`,
`datetime-local`, `checkbox`, `select`, `textarea`, and `search-select`. Password,
radio, file, and hidden fields remain available through dialogs only.

### Column mapping

Mapping uses this fixed order:

1. an explicit unique DataTables column name in `inline.columns`;
2. an exact string match between `column().dataSrc()` and the field path;
3. unavailable.

```ts
const table = new DataTable<UserRow>('#users', {
  columns: [
    { data: 'profile.name', name: 'displayName' },
    { data: 'rank', name: 'rank' },
    { data: null, name: 'actions' },
  ],
  rowId: 'id',
});

const editor = new AltEditorLite(table, {
  editMode: 'inlineDoubleClick',
  fields,
  inline: {
    columns: {
      actions: false,
      displayName: 'profile.name',
      rank: 'rank',
    },
  },
});
```

`false` disables both explicit editing and automatic fallback for that named
column. Header text, rendered text, classes, case-insensitive matches, partial
paths, render results, and function data sources are never used to infer a field.

### Activation and public methods

Double-click is the only automatic activation gesture. A single click never
starts editing. Programmatic activation bypasses the gesture strategy:

```ts
await editor.openInlineEdit('#user-42', 'displayName:name');
await editor.submitInlineEdit();
await editor.cancelInlineEdit();

console.log(editor.getInlineState());
console.log(editor.isInlineEditing());
```

Both selectors must resolve exactly one target. Interactive descendants such as
links, buttons, form controls, editable content, and elements marked with
`data-alteditor-lite-ignore-inline` do not activate inline editing. Use
`openInlineEdit()` from an application control when the cell display itself is an
interactive element.

### Keyboard and focus

- Enter submits single-line text-like controls when `enterAction` is `submit`.
- Native Select and SearchSelect keep Enter for choosing the current option. Use
  Tab, blur submission, or `submitInlineEdit()` to commit a native Select value.
- Escape cancels. SearchSelect consumes the first Escape when its popup is open;
  a later Escape cancels the cell session.
- Tab submits and opens the next eligible visible cell on the current page by
  default.
- Shift+Tab submits and moves backward.
- Textarea Enter inserts a line break. Ctrl+Enter or Command+Enter submits.
- Arrow keys and option selection remain owned by Select and SearchSelect
  controls.

Tab navigation never wraps, changes page, creates a row, or guesses a stale
destination. It waits for the preceding commit draw to complete before opening
the next cell. Configure a stable DataTables `rowId` when navigation must remain
reliable across refreshes or other row replacement.

After success, focus is resolved from the committed row and column after the draw.
A pre-draw input, host, or cell node is never reused as the focus target. If the
cell is unavailable, focus falls back to the table.

### Blur behavior

`blurAction` defaults to `submit`. It also accepts `cancel` and `none`. Focus
moving within an inline-owned SearchSelect or its popup does not trigger the blur
action. Validation and operation failures retain the candidate, mark the compact
view invalid, and open a plain-text modal alert. Closing the alert restores focus
to the current control when it is still mounted, so the value can be corrected
and retried. Alert focus transfer never triggers a blur submission.

An `onChange` failure is retained only for the input revision that produced it.
It is reported through the normal error channels without opening an alert
immediately. Submission checks the latest retained failure after field
validation; a newer input clears a stale failure.

### Values and validation

The editing value comes from the canonical row through the declared field path,
not from displayed cell text. Validation receives complete values built from
declared, collectable fields in the original row with the current candidate
overlaid.

Validation order is:

1. normalized candidate collection;
2. native constraint validation;
3. the field's custom validator;
4. local uniqueness among currently loaded rows;
5. the latest retained `onChange` result;
6. `beforeSubmit`;
7. submit event and persistence.

An unchanged normalized value closes with reason `unchanged` and does not
validate, publish submit or success, or call persistence.

### Persistence and commit modes

Inline Edit uses the same update order as dialog Edit:

1. `operations.update`;
2. `clientSide.updateRow`;
3. safe merge of the edited declared field.

When neither update callback is configured, both dialog and inline Edit use the
safe local merge and replace the DataTables row only. No remote persistence takes
place in that fallback.

The canonical DataTables row is not changed until persistence returns a complete
row successfully.

The default `updateMode: 'replace-row'` replaces the row and waits for an owned
`draw(false)`. `updateMode: 'refresh'` requires both `operations.update` and
`operations.refresh`:

```ts
inline: {
  updateMode: 'refresh',
},
operations: {
  async update(values, original, context) {
    return await saveUser(original.id, values, context.signal);
  },
  async refresh(context) {
    await reloadUsers(context.signal);
  },
},
```

In refresh mode, the application owns the DataTables mutation. A stable `rowId`
is required for reliable post-refresh focus recovery.

## Rendered cell controls

DataTables may use `columns.render` or `columnDefs.render` to display a `<select>`,
`<input>`, badge, link, or other derived markup. Rendering does not change the
editing contract:

- Dialog and inline values are read from the canonical row object through the
  declared field path, never from rendered markup.
- A rendered form control is preserved while inline editing is open and is not
  nested inside the editor control.
- Automatic inline activation ignores the rendered interactive descendant. Use
  an application control with `openInlineEdit()` or activate non-interactive cell
  space.
- A successful inline or dialog update replaces the canonical row and redraws it.
  DataTables then calls the renderer again, so the displayed control reflects the
  committed value.
- Changing a rendered control directly does not update row data unless the
  application separately implements that behavior through DataTables public APIs.

Render functions should return the underlying data for sorting, filtering, and
type detection, and return HTML only for the `display` type. Treat row values as
untrusted and escape them before placing them in HTML attributes or text.

## Redraw, cancellation, and destroy

An unrelated draw, column visibility change, Scroller recycle, or column reorder
cancels an active inline session with close reason `redraw`. Validation and
persistence are aborted, late results are ignored, and detached content is not
restored.

`destroy()` aborts activation, validation, persistence, and draw waiting; removes
inline listeners and controls; safely restores a still-valid undrawn cell when
possible; and prevents late DOM, DataTables, focus, or event work.

## DataTables extension boundaries

- Buttons and Select are supported through their existing optional integrations.
  Dialog Edit is hidden in Inline mode. All visible editor buttons are disabled
  during an active inline session, and the session does not clear selection.
  Clicking another editor action does not cancel Inline editing; submit or cancel
  the current cell before starting another operation.
- KeyTable has basic coexistence. Consumed control keys stop before KeyTable
  handles them, and post-commit focus uses a public cell focus method when
  available. Typing-to-edit and `keys.editor` integration are not provided.
- Responsive supports the main table cell only. Child-row representations and
  columns hidden by either DataTables or Responsive are unavailable. A responsive
  visibility change cancels the active inline session.
- Scroller redraw and node recycling cause safe cancellation. Applications should
  verify their row-height and server data configuration in supported browsers.
- FixedColumns clone cells are not supported; activation is limited to cells
  uniquely resolved inside the owned main table.
- Column reorder events cancel the current session. Recreate the editor before
  allowing more inline edits after a runtime reorder because the cached
  column-to-field mapping is not rebuilt automatically.
- Server-side tables should configure `rowId` and normally use refresh mode. Local
  uniqueness covers only loaded rows.

Only public DataTables APIs and public lifecycle events are used.
