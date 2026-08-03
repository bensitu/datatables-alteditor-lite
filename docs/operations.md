# Operations

AltEditorLite performs non-optimistic mutations. A persistence callback must
finish successfully before any row is added, replaced, or removed in DataTables.

```ts
const editor = new AltEditorLite<UserRow, UserForm>(table, {
  fields,
  operations: {
    async create(values, context) {
      return await createUser(values, context.signal);
    },
    async update(values, original, context) {
      return await updateUser(original.id, values, context.signal);
    },
    async remove(rows, context) {
      await removeUsers(
        rows.map((row) => row.id),
        context.signal,
      );
    },
    async refresh(context) {
      const rows = await loadUsers(context.signal);
      context.table.clear().rows.add(rows).draw(false);
    },
  },
});
```

Each callback receives the owned DataTables API, an `AbortSignal`, and the current
operation discriminator. Closing a submitting dialog or destroying the editor
aborts the signal. Results from an aborted, replaced, or destroyed request are
ignored.

## Create

`openCreateDialog()` validates and collects the form before publishing `submit`.
`operations.create` may be synchronous or asynchronous.
`clientSide.createRow` is synchronous. The returned value must be a complete row
object; form values are never cast to the row type.

When both Create implementations are absent, opening Create rejects with
`EditorConfigurationError`.

## Edit

```ts
await editor.openEditDialog('#user-42');
```

An explicit DataTables row selector does not require Select. When the selector is
omitted, Select must resolve exactly one selected row.

The target is captured before the dialog opens. Later selection changes do not
change it. At submission, AltEditorLite resolves identity in this order:

1. public row-id selector, with index and live-object validation;
2. connected row node owned by the same table;
3. captured row index only while the same live row object still occupies it.

If identity cannot be proven, `EditorTargetUnavailableError` is displayed and no
persistence callback or table mutation occurs. Identity is checked again after an
asynchronous callback before mutation.

This policy intentionally fails closed. Without a configured public `rowId`, an
external deletion or row rebuild can invalidate a captured index even when another
row now has similar data. Configure a stable `rowId` when Edit or Remove must
tolerate unrelated external table changes; AltEditorLite never retargets by value.

The `original` callback argument is a frozen shallow copy captured before opening.
The default update implementation copies only configured and collected field
paths. Edited nested branches become new plain objects, unrelated properties are
preserved, and the original row is not mutated. An enabled field explicitly
cleared to normalized `undefined` clears that property in the replacement row;
disabled or unrendered fields remain untouched.

## Remove

```ts
await editor.openRemoveDialog(['#user-42', '#user-43']);
```

Remove always opens a confirmation dialog and never constructs a form controller.
All targets are captured before confirmation. A later selection change is
irrelevant. If any target becomes unavailable, the entire operation fails; partial
deletion is not performed.

`operations.remove` runs before DataTables mutation. Without it, AltEditorLite
removes the captured rows locally after confirmation.

## Refresh

`refreshTable()` does not open a dialog and is mutually exclusive with dialog
operations. By default, Ajax tables wait for the public reload callback and local
tables redraw without resetting paging. DataTables does not expose an
`AbortSignal` parameter for `ajax.reload()`, so aborting editor ownership cannot
guarantee cancellation of that transport.

Configure `operations.refresh(context)` when network-level cancellation is
required. The callback receives the owned signal and DataTables API, replaces the
default refresh behavior, and is responsible for applying its result through
public DataTables methods. Aborted or superseded callback results do not publish
AltEditorLite success events.

## Errors and retry

Throw `AltEditorLiteError` when the callback owns safe user-facing text, field
errors, and retryability:

```ts
throw new AltEditorLiteError({
  code: 'EMAIL_CONFLICT',
  message: 'Correct the highlighted fields.',
  fieldErrors: {
    email: 'This email is already registered.',
  },
  retryable: true,
});
```

Ordinary `Error`, `TypeError`, plain objects, and other unknown values are shown
with the localized generic message; raw messages, stacks, response bodies, and
serialized values are not exposed. Convert only text that is safe for end users
into an `AltEditorLiteError`.

Only errors marked retryable keep the primary action enabled. Retrying creates a
new request identity and a new signal. Cancellation does not publish a normal
error.
