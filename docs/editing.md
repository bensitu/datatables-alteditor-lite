# Editing

AltEditorLite provides complete-form Dialog editing and compact editing for one
cell at a time. Set one `editMode` for each editor instance. Both presentations
use the same non-optimistic update transaction and are mutually exclusive with
operations already in progress on the owned table. Double-click sessions retain
automatic cancellation before Create, Remove, or Refresh; hover sessions must be
resolved with Submit or Cancel first.

| `editMode`          | Dialog Edit | Inline Edit | Activation                   |
| ------------------- | ----------- | ----------- | ---------------------------- |
| `dialog` (default)  | Available   | Unavailable | Dialog action                |
| `inlineDoubleClick` | Unavailable | Available   | Double-click, keyboard, API  |
| `inlineHover`       | Unavailable | Available   | Pencil, touch, keyboard, API |

Create, Remove, and Refresh remain available in both modes when their normal
requirements are met.

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

Inline editing requires `editMode: 'inlineDoubleClick'` or `inlineHover` and at
least one eligible field with `inlineEdit: true`:

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

`inlineDoubleClick` opens from a double-click. `inlineHover` moves one native
pencil into the eligible cell under a fine pointer. On touch, the first tap keeps
normal Select/KeyTable behavior and reveals the pencil; tapping the pencil opens
editing. A normal cell-body click never starts hover editing. Programmatic
activation bypasses the gesture strategy:

```ts
await editor.openInlineEdit('#user-42', 'displayName:name');
await editor.submitInlineEdit();
await editor.cancelInlineEdit();

console.log(editor.getInlineState());
console.log(editor.isInlineEditing());
```

Both selectors must resolve exactly one target. Interactive descendants such as
links, buttons, form controls, `[contenteditable]`, and elements marked with
`data-alteditor-lite-ignore-inline` do not activate inline editing. Use
`openInlineEdit()` from an application control when the cell display itself is an
interactive element.

### Keyboard and focus

When KeyTable is available, `inline.keyboardActivation` defaults to `{ key:
'F2' }`. Set it to `false` or use a shortcut such as `{ key: 'e', ctrlKey: true
}`. Arrow keys, Tab, Home, End, PageUp, and PageDown are reserved, and IME
composition never activates editing. KeyTable is disabled during editing and its
exact prior state is restored afterward.

The following compact behavior applies to `inlineDoubleClick`:

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

For `inlineHover`, native Submit and Cancel buttons own resolution. Blur, Tab,
Enter, and Escape do not submit or cancel the session. Field-owned behavior still
applies, such as Escape closing a SearchSelect popup. Validation or persistence
disables both actions; a failure re-enables them and retains the candidate.

Tab navigation never wraps, changes page, creates a row, or guesses a stale
destination. It waits for the preceding commit draw to complete before opening
the next cell. Configure a stable DataTables `rowId` when navigation must remain
reliable across refreshes or other row replacement.

After success, focus is resolved from the committed row and column after the draw.
A pre-draw input, host, or cell node is never reused as the focus target. If the
cell is unavailable, focus falls back to the table.

### Blur behavior

In `inlineDoubleClick`, `blurAction` defaults to `submit`. It also accepts
`cancel` and `none`. Focus
moving within an inline-owned SearchSelect or its popup does not trigger the blur
action. Validation and operation failures retain the candidate, mark the compact
view invalid, and open a plain-text modal alert. Closing the alert restores focus
to the current control when it is still mounted, so the value can be corrected
and retried. Alert focus transfer never triggers a blur submission.

When `tabAction` is `none`, Tab keeps its normal browser focus behavior. Moving
focus out of the Inline control can therefore still invoke the configured
`blurAction`; set `blurAction: 'none'` as well when Tab must leave without an
editor action.

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

Rendered controls can be application-owned editing shortcuts. Resolve their cell
with the public DataTables API, then route the requested value through
`openInlineEdit()` in Inline mode or `openEditDialog()` and `getField()` in Dialog
mode. Keep the canonical row unchanged until the selected editor workflow commits.
The live demo includes this pattern for rendered Priority and Support window
controls.

Render functions should return the underlying data for sorting, filtering, and
type detection, and return HTML only for the `display` type. Treat row values as
untrusted and escape them before placing them in HTML attributes or text.

The supplied stylesheet keeps Inline controls compact: the editing cell owns one
focus outline, text-like controls use a `2rem` control height without an inner
border, and Inline checkboxes use a `1rem` control. This prevents normal rows
from growing solely because a cell entered Inline Edit. Applications overriding
these rules should preserve a visible focus indicator and the table's row rhythm.

The hover pencil and explicit actions use native buttons, logical positioning,
the existing theme variables, and forced-colors-safe focus indicators.

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
  Dialog Edit is hidden in Inline mode. Create, Remove, and Refresh cancel an
  active double-click session, but remain unavailable until an active hover
  session is explicitly resolved.
- KeyTable focused-cell events drive optional shortcut activation and pencil
  placement. The shortcut uses an owned native keydown boundary rather than
  the extension's forwarded `key` event. Typing-to-edit and `keys.editor`
  integration are not provided.
- Responsive supports the main table cell only. Child-row representations and
  columns hidden by either DataTables or Responsive are unavailable. A responsive
  visibility change cancels the active inline session.
- Scroller redraw and node recycling cause safe cancellation. Applications should
  verify their row-height and server data configuration in supported browsers.
- FixedColumns clone cells are not supported; activation is limited to cells
  uniquely resolved inside the owned main table.
- Column reorder events cancel the current session. The completed
  `columns-reordered` lifecycle rebuilds the stable mapping in place, so every
  activation path continues to target the correct field without recreating the
  editor.
- Server-side tables should configure `rowId` and normally use refresh mode. Local
  uniqueness covers only loaded rows.

Only public DataTables APIs and public lifecycle events are used.
