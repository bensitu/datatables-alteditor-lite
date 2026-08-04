# Inline editing

Version 0.2.0 adds optional, non-optimistic editing of one DataTables cell at a time. Dialog Create, Edit, Remove, and Refresh remain available and mutually exclusive with an inline session.

## Enable fields and the editor

Inline editing is disabled by default. A field and the editor must both opt in:

```ts
const editor = new AltEditorLite<UserRow, UserValues>(table, {
  fields: [
    {
      inlineEdit: true,
      label: 'Display name',
      name: 'profile.name',
      required: true,
      type: 'text',
    },
  ],
  inline: {
    enabled: true,
  },
});
```

An eligible field must also be editable, enabled, visible, writable, supported by inline editing, and mapped to an available visible column.

Supported fields are `text`, `email`, `number`, `date`, `time`, `datetime-local`, `checkbox`, `select`, `textarea`, and `search-select`. Password, radio, file, and hidden fields are intentionally unavailable inline.

## Column mapping

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
  fields,
  inline: {
    columns: {
      actions: false,
      displayName: 'profile.name',
      rank: 'rank',
    },
    enabled: true,
  },
});
```

`false` disables both explicit editing and automatic fallback for that named column. Header text, rendered text, classes, case-insensitive matches, partial paths, render results, and function data sources are never used to infer a field.

## Activation and public methods

Double-click activation is the default. Use `activation: 'click'` for single click, or `activation: 'none'` for API-only activation.

```ts
await editor.openInlineEdit('#user-42', 'displayName:name');
await editor.submitInlineEdit();
await editor.cancelInlineEdit();

console.log(editor.getInlineState());
console.log(editor.isInlineEditing());
```

Both row and column selectors must resolve exactly one target. Interactive descendants such as links, buttons, controls, editable content, and elements marked with `data-alteditor-lite-ignore-inline` do not activate the editor.

## Keyboard and focus

- Enter submits single-line controls when `enterAction` is `submit`.
- Escape cancels. SearchSelect consumes the first Escape when its popup is open; a later Escape cancels the cell session.
- Tab submits and opens the next eligible visible cell on the current page by default.
- Shift+Tab submits and moves backward.
- Textarea Enter inserts a line break. Ctrl+Enter or Command+Enter submits.
- Arrow keys and option selection remain owned by Select and SearchSelect controls.

Tab navigation never wraps, changes page, creates a row, or guesses a stale destination. It waits for the preceding commit draw to complete before opening the next cell.

After success, focus is resolved from the committed row and column after the draw. A pre-draw input, host, or cell node is never reused as the focus target. If the cell is unavailable, focus falls back to the table.

## Blur behavior

`blurAction` defaults to `submit`. It also accepts `cancel` and `none`. Focus moving within an inline-owned SearchSelect or its popup does not trigger the blur action. A validation failure keeps the candidate open, displays the field error, and restores control focus.

## Values and validation

The editing value comes from the canonical row through the declared field path, not from displayed cell text. Validation receives complete values built from declared, collectable fields in the original row with the current candidate overlaid.

Validation order is:

1. normalized candidate collection;
2. native constraint validation;
3. the field's custom validator;
4. local uniqueness among currently loaded rows;
5. `beforeSubmit`;
6. submit event and persistence.

An unchanged normalized value closes with reason `unchanged` and does not validate, publish submit or success, or call persistence.

## Persistence and commit modes

Inline Edit uses the same update order as dialog Edit:

1. `operations.update`;
2. `clientSide.updateRow`;
3. safe merge of the edited declared field.

The canonical DataTables row is not changed until persistence returns a complete row successfully.

The default `updateMode: 'replace-row'` replaces the row and waits for an owned `draw(false)`. `updateMode: 'refresh'` requires both `operations.update` and `operations.refresh`:

```ts
inline: {
  enabled: true,
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

In refresh mode, the application owns the DataTables mutation. A stable `rowId` is required for reliable post-refresh focus recovery.

## Redraw, cancellation, and destroy

An unrelated draw, column visibility change, Scroller recycle, or column reorder cancels an active inline session with close reason `redraw`. Validation and persistence are aborted, late results are ignored, and detached content is not restored.

`destroy()` aborts activation, validation, persistence, and draw waiting; removes inline listeners and controls; safely restores a still-valid undrawn cell when possible; and prevents late DOM, DataTables, focus, or event work.

## DataTables extension boundaries

- Buttons and Select are supported through their existing optional integrations. Buttons are disabled during an inline session, and the session does not clear selection.
- KeyTable has basic coexistence. Consumed control keys stop before KeyTable handles them, and post-commit focus uses a public cell focus method when available. Typing-to-edit and `keys.editor` integration are not provided.
- Responsive supports the main table cell only. Child-row representations and hidden columns are unavailable.
- Scroller redraw and node recycling cause safe cancellation. Applications should verify their row-height and server data configuration in supported browsers.
- FixedColumns clone cells are not supported; activation is limited to cells uniquely resolved inside the owned main table.
- ColReorder is not supported in 0.2.0. A reorder cancels the current session; recreate the editor if the application changes the configured column order at runtime.
- Server-side tables should configure `rowId` and normally use refresh mode. Local uniqueness covers only loaded rows.

Only public DataTables APIs and public lifecycle events are used.
