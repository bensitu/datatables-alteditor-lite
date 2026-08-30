# Operations

AltEditorLite performs non-optimistic mutations. A persistence callback must
finish successfully before the Host is asked to add, replace, or remove a record.

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
      table.clear().rows.add(rows).draw(false);
    },
  },
});
```

Each callback receives an `AbortSignal`, the current operation discriminator, the
initiating `mode` (`dialog`, `inline`, or `api`), and a stable neutral `target`
when Edit owns one. Contexts do not contain a DataTables API. DataTables
applications can retain `table` in application scope or retain a
`DataTablesHost` and call `unwrap()` explicitly. Closing a submitting
presentation or destroying the editor aborts the signal. Results from an aborted,
replaced, or destroyed request are ignored.

Consumer-owned callbacks also own their request deadlines. Apply an
application-appropriate timeout in the callback and use the supplied signal to
cancel underlying network work. The editor does not impose a fixed deadline on
Create, Edit, Remove, or Refresh operations.

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

The selector and identity rules below apply to the `/datatables` `AltEditorLite`
facade. The neutral root API instead accepts an opaque target understood by its
Host.

An explicit DataTables row selector does not require Select. When the selector is
omitted, Select must resolve exactly one selected row.

The target is captured before the dialog opens. Later selection changes do not
change it. At submission, AltEditorLite resolves identity in this order:

1. public row-id selector, with index and live-object validation;
2. connected row node owned by the same table;
3. captured row index only while the same live row object still occupies it.

If identity cannot be proven, `EditorTargetUnavailableError` is displayed and no
persistence callback or Host mutation occurs. Identity is checked again after an
asynchronous callback before application.

This policy intentionally fails closed. Without a configured public `rowId`, an
external deletion or row rebuild can invalidate a captured index even when another
row now has similar data. Configure a stable `rowId` when Edit or Remove must
tolerate unrelated external table changes; AltEditorLite never retargets by value.

The `original` callback argument is a detached snapshot captured before opening.
Plain nested records and arrays are recursively copied and frozen, so callback code
cannot mutate the corresponding live row data through the snapshot.
The default update implementation copies only configured and collected field
paths. Edited nested branches become new plain objects, unrelated properties are
preserved, and the original row is not mutated. An enabled field explicitly
cleared to normalized `undefined` clears that property in the replacement row;
disabled or unrendered fields remain untouched.

When both `operations.update` and `clientSide.updateRow` are absent, Edit uses
that default merge and asks the Host to apply the complete replacement row. With
`DataTablesHost`, this updates the DataTables row locally. It does not persist the
change to a remote service.

Dialog and inline Edit use the same target validation, value collection,
persistence resolution, error normalization, row replacement, draw ownership,
and event ordering. Inline `replace-row` mode commits the complete returned row.
Inline `refresh` mode requires both `operations.update` and
`operations.refresh`; it persists first and then lets the refresh operation
provide the canonical table data.

## Multi-record Edit

```ts
await editor.openBatchEditDialog(['#user-42', '#user-43']);
```

The submitted `BatchChanges<TFormValues>` contains only fields assigned an
explicit common value. Preserved common values, preserved differing values,
hidden fields, unique fields, and file fields are not broadcast to other
records. An empty change set closes as unchanged without persistence, Host
application, or a success event.

Configure remote multi-record persistence with one callback:

```ts
operations: {
  async updateMany(changes, originals, context) {
    return await updateUsers(
      originals.map((row) => row.id),
      changes,
      context.signal,
    );
  },
},
```

`updateMany` receives the common changes, readonly original rows in target
order, and a `batchEdit` / `dialog` context. It must return the same number of
complete canonical rows in the same order. All results are checked before the
Host mutates any record.

Resolution order is `operations.updateMany`, then synchronous
`clientSide.updateRow(original, changes)` for each original, then the safe
declared-field merge. If `operations.update` is configured without
`operations.updateMany`, multi-record editing is unavailable; the single-record
callback is never called repeatedly. Applications performing remote updates own
their service-side transaction and partial-failure policy.

`DataTablesHost` validates every target before replacement, performs one draw,
and attempts to restore earlier synchronous replacements if a later setter
throws. `StandaloneHost` exposes the capability only when `applyUpdates` is
configured. These Host guarantees do not roll back remote persistence that has
already completed.

## Remove

```ts
await editor.openRemoveDialog(['#user-42', '#user-43']);
```

Remove always opens a confirmation dialog and never constructs a form controller.
All targets are captured before confirmation. A later selection change is
irrelevant. If any target becomes unavailable, the entire operation fails; partial
deletion is not performed.

`operations.remove` runs before Host application. Without it, AltEditorLite asks
the Host to remove the captured records locally after confirmation.

## Refresh

`refresh()` does not open a dialog, safely cancels an active double-click
Inline session, and rejects while a hover Inline session awaits Submit or Cancel,
and remains mutually exclusive with dialog operations. `DataTablesHost` waits for
the public reload callback for Ajax tables and redraws local tables without
resetting paging. If an Ajax reload callback does not arrive within 30 seconds,
the refresh rejects with a normalized error and releases editor ownership.
DataTables does not expose an
`AbortSignal` parameter for `ajax.reload()`, so aborting editor ownership cannot
guarantee cancellation of that transport. `StandaloneHost` invokes its optional
consumer-provided refresh callback and otherwise completes without changing
records.

Configure `operations.refresh(context)` when network-level cancellation is
required. The callback receives the owned signal, replaces the Host's default
refresh behavior, and is responsible for applying its result. Retain the
DataTables API or call `DataTablesHost.unwrap()` when that implementation uses
public DataTables methods. Aborted or superseded callback results do not publish
AltEditorLite success events. Every started refresh emits its completion
notification, including work canceled by replacement or destruction.

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
