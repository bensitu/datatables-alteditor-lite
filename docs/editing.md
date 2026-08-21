# Editing

AltEditorLite provides complete-form Dialog editing and compact editing for one
cell at a time. These capabilities are composable: applications can enable
Dialog only, Inline only, or both on one editor. Both presentations use the same
non-optimistic Update transaction and remain mutually exclusive with work already
in progress on the owned Host.

| Configuration                   | Dialog Edit | Inline Edit | Typical use                        |
| ------------------------------- | ----------- | ----------- | ---------------------------------- |
| Default                         | Available   | Unavailable | Complete forms                     |
| Dialog enabled, Inline disabled | Available   | Unavailable | Explicit Dialog-only configuration |
| Dialog disabled, Inline enabled | Unavailable | Available   | Compact cell editing               |
| Dialog enabled, Inline enabled  | Available   | Available   | Complete forms plus quick updates  |

Create, Remove, and Refresh remain available when their normal requirements are
met, regardless of which Edit presentations are enabled.

## Dialog editing

Dialog Create and Remove are independent of Edit presentation. Dialog Edit
requires `editing.dialog.enabled` to be true, which is the default. These
workflows are available through public methods or the optional DataTables Buttons
integration:

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

`editing.dialog.template` can arrange editor-owned fields in a cloned custom
layout. Dialog dependencies resolve after defaults or Edit source values are
populated and before the form becomes visible. See [Dynamic forms](forms.md).

The dialog keeps the originally captured Edit row even if selection later
changes. It revalidates that identity before submission and again after
asynchronous persistence. Successful updates replace the complete row, wait for
the DataTables draw, close according to configuration, and restore focus to a
connected logical target.

### Hybrid interaction ownership

When both Edit presentations are enabled, the same fields, validators, Update
callback, hooks, and events serve both. The Dialog Edit button and
`openEditDialog()` remain available, while eligible cells also support the
configured Inline activation.

Only one presentation can own interaction at a time:

- an open or opening dialog causes Inline activation to reject as busy;
- Create, Remove, Refresh, or Dialog Edit cancels an active double-click Inline
  session before continuing;
- a hover Inline session requires explicit Submit or Cancel, so an external
  operation rejects while it remains active;
- a running persistence or refresh request cannot be replaced by another editor
  operation.

Hooks and lifecycle events identify the initiating presentation with
`mode: 'dialog'` or `mode: 'inline'`. Refresh uses `mode: 'api'`. Applications can
apply policy by mode without constructing separate editor instances.

## Inline editing

Inline editing requires `editing.inline.enabled: true` and at least one eligible
field with `inlineEdit: true`:

```ts
const editor = new DataTablesEditor<UserRow, UserValues>(table, {
  editing: {
    dialog: { enabled: true },
    inline: { activation: 'doubleClick', enabled: true },
  },
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

The `editing.inline` object enables and configures the capability. A field may
keep `inlineEdit: true` while Inline editing is disabled; the flag takes effect
when the capability is enabled.

An eligible field must also be editable, enabled, visible, writable, supported by
inline editing, and mapped to an available visible column.

Supported fields are `text`, `email`, `number`, `date`, `time`,
`datetime-local`, `checkbox`, `select`, `textarea`, and `search-select`. Password,
radio, file, and hidden fields remain available through dialogs only.

### Column mapping

Mapping uses this fixed order:

1. an explicit unique DataTables column name in `editing.inline.columns`;
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

const editor = new DataTablesEditor(table, {
  editing: {
    dialog: { enabled: true },
    inline: {
      activation: 'doubleClick',
      columns: {
        actions: false,
        displayName: 'profile.name',
        rank: 'rank',
      },
      enabled: true,
    },
  },
  fields,
});
```

`false` disables both explicit editing and automatic fallback for that named
column. Header text, rendered text, classes, case-insensitive matches, partial
paths, render results, and function data sources are never used to infer a field.

### Activation and public methods

`activation: 'doubleClick'` opens from a mouse double-click or two taps on the
same eligible cell. A single tap and taps that move between cells retain normal
table behavior. `activation: 'hover'` moves one native pencil into the eligible
cell under a fine pointer. On touch, the first tap keeps normal Select/KeyTable
behavior and reveals the pencil; tapping the pencil opens editing. A normal
cell-body click never starts hover editing. Programmatic activation bypasses the
gesture strategy:

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

When KeyTable is available, `editing.inline.keyboardActivation` defaults to
`{ key: 'F2' }`. Set it to `false` or use a shortcut such as `{ key: 'e',
ctrlKey: true }`. Setting it to `false` disables only focused-cell activation;
it does not disable keyboard behavior inside an open session. Arrow keys, Tab,
Home, End, PageUp, and PageDown are reserved, and IME composition never activates
editing. KeyTable is disabled during editing and its exact prior state is
restored afterward.

The following compact behavior applies to double-click activation:

- Enter submits single-line text-like controls when `enterAction` is `submit`.
- Native Select and SearchSelect keep Enter for choosing the current option. Use
  Tab, blur submission, or `submitInlineEdit()` to commit a native Select value.
- Escape cancels the cell session without saving, including while a SearchSelect
  popup is open.
- Tab submits and opens the next eligible visible cell on the current page by
  default.
- Shift+Tab submits and moves backward.
- Textarea Enter inserts a line break. Ctrl+Enter or Command+Enter submits.
- Arrow keys and option selection remain owned by Select and SearchSelect
  controls.

For hover activation, native Submit and Cancel buttons provide explicit actions.
Escape also cancels the cell session without saving. Blur, Tab, and Enter do not
submit or cancel the session. Validation or persistence disables both actions; a
failure re-enables them and retains the candidate.

Tab navigation never wraps, changes page, creates a row, or guesses a stale
destination. It waits for the preceding commit draw to complete before opening
the next cell. Configure a stable DataTables `rowId` when navigation must remain
reliable across refreshes or other row replacement.

After success, focus is resolved from the committed row and column after the draw.
A pre-draw input, host, or cell node is never reused as the focus target. If the
cell is unavailable, focus falls back to the table.

An explicit cancellation returns focus to the connected element that initiated
opening. The editor captures that element before running `beforeOpen` or
asynchronous field normalization, so focus changes made while opening is pending
do not replace the restoration target.

### Blur behavior

With double-click activation, `blurAction` defaults to `submit`. It also accepts
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
overlaid. Plain objects and arrays in those values are recursively frozen before
callbacks run. Browser host objects such as `File` are retained and are not
frozen.

Validation order is:

1. read the normalized candidate and close immediately when it is unchanged;
2. validate the active field's native constraints;
3. build complete values from the canonical row and current candidate;
4. run the active field's custom validator;
5. check local uniqueness among currently loaded rows;
6. await the latest active-field `onChange` result;
7. run the shared `validateForm` callback when configured;
8. run `beforeSubmit`;
9. publish submit and invoke persistence.

A `validateForm` error for the active path is associated with the Inline
presentation. Errors for other paths and a global message appear in the alert
summary because Inline does not construct the other Dialog fields. Validation
failure leaves the candidate editable and canonical DataTables data unchanged.

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

The canonical Host record is not changed until persistence returns a complete
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

The supplied stylesheet keeps Inline controls compact: the focused control owns
the visible outline, the cell editing border becomes transparent while a valid
descendant has visible focus, text-like controls use a `2rem` control height
without an inner border, and Inline checkboxes use a `1rem` control. Invalid cells
retain their error border. This prevents normal rows from growing solely because
a cell entered Inline Edit. Applications overriding these rules should preserve a
visible focus indicator and the table's row rhythm.

The hover pencil and explicit actions use native buttons, logical positioning,
the existing theme variables, and forced-colors-safe focus indicators.

## Redraw, cancellation, and destroy

An unrelated draw, column visibility change, Scroller recycle, or column reorder
cancels an active inline session with close reason `redraw`. Validation and
persistence are aborted, late results are ignored, and detached content is not
restored.

`destroy()` aborts activation, validation, persistence, and presentation waiting;
removes inline listeners and controls; safely restores a still-valid undrawn cell
when possible; and prevents late DOM, Host, focus, or event work.

## Host boundaries

The neutral `AltEditorLite` constructor accepts an `EditorHost` and opaque Host
targets. `DataTablesEditor` adapts public row and column selectors to those
targets and retains the detailed DataTables inline state. `StandaloneHost` does
not provide inline presentation, so it supports the dialog workflows only.

Neutral operation, hook, validation, and event contexts contain no DataTables
API. Their target shape uses an optional `key` and `fieldNames`. Applications
that require DataTables-native work keep the `DataTablesHost` in scope and call
`unwrap()` explicitly.

## DataTables extension boundaries

- Buttons and Select are supported through their existing optional integrations.
  Dialog Edit remains available when `editing.dialog.enabled` is true, including
  Hybrid configuration. Create, Remove, Refresh, and Dialog Edit cancel an active
  double-click session, but remain unavailable until an active hover session is
  explicitly resolved.
- KeyTable focused-cell events drive optional shortcut activation and pencil
  placement. The shortcut uses an owned native keydown boundary rather than
  the extension's forwarded `key` event. Typing-to-edit and `keys.editor`
  integration are not provided.
- Responsive supports the main table cell only. Child-row representations and
  columns hidden by either DataTables or Responsive are unavailable. A responsive
  visibility change cancels the active inline session. After a successful CRUD
  operation, Responsive recalculation runs only after Inline cleanup completes.
- ColumnControl dynamic SearchList options are refreshed after successful CRUD
  operations through its public API. Inline cleanup completes before the refresh.
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
