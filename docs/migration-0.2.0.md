# Migrating to 0.2.0

Version 0.2.0 is additive for existing dialog CRUD applications. Inline editing remains disabled unless explicitly enabled.

## Existing callbacks

Persistence callback parameters are unchanged. `OperationContext` now also includes `mode` and an optional Edit `target`; existing callbacks can ignore both.

All lifecycle event details now include `mode`. Inline Edit reuses the existing event names and adds an optional cell `target`; there is no separate inline event family.

## Enabling inline editing

1. Add `inlineEdit: true` to each eligible field.
2. Add `inline: { enabled: true }` to the editor options.
3. Give rendered or action columns unique DataTables names and map them explicitly when their data source is not the exact field path.
4. Configure `rowId` for stable focus, redraw, server-side, and refresh behavior.
5. Review keyboard, blur, and extension boundaries in [Inline editing](./inline-editing.md).

No `operations.updateCell`, `inline.fields`, jQuery API, optimistic update, or private DataTables setting is introduced.

## Refresh mode

Applications choosing `inline.updateMode: 'refresh'` must provide both `operations.update` and `operations.refresh`. The update callback persists and returns a complete row; the refresh callback owns the DataTables reload or replacement.

## Hook migration

DOM events remain observation-only. Move policies that must decline opening or submission into `beforeOpen` or `beforeSubmit`. Use `afterSuccess` for follow-up work that must not alter the committed result, and `onError` for normalized application reporting.
