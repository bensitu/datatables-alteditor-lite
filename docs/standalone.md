# Standalone usage

The Standalone integration provides AltEditorLite dialog workflows without a
table or grid runtime. The application owns record storage and every list, card,
or detail view that presents those records. AltEditorLite owns its dialogs,
fields, validation, operations, and lifecycle events; it does not render or
synchronize an application data view automatically. `StandaloneHost` supports
Dialog Create, Edit, and Remove plus Refresh; it does not provide Inline Edit.

Import the shared stylesheet whenever the editor presents dialogs:

```ts
import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';
import 'datatables-alteditor-lite/style.css';
```

The root `datatables-alteditor-lite` entry exports the neutral editor, Host
contracts, fields, operations, events, and language utilities. The `/standalone`
entry re-exports that neutral API and adds `StandaloneHost`. Neither entry imports
or registers DataTables.

## Record ownership

`StandaloneHost` delegates record access and application to consumer callbacks.
The target type is an application-defined stable key. Standalone does not provide
selection, so Edit and Remove calls must receive explicit targets.

```ts
const records = new Map<string, UserRecord>();

const host = new StandaloneHost<UserRecord, string>({
  read(target) {
    const record = records.get(target);
    if (record === undefined) {
      throw new Error('Record unavailable.');
    }
    return record;
  },
  applyCreate(record) {
    records.set(record.id, record);
    renderRecords(records);
    return record.id;
  },
  applyUpdate(target, record) {
    records.set(target, record);
    renderRecords(records);
    return target;
  },
  applyUpdates(updates) {
    for (const { target, row } of updates) {
      records.set(target, row);
    }
    renderRecords(records);
  },
  applyRemove(targets) {
    for (const target of targets) {
      records.delete(target);
    }
    renderRecords(records);
  },
});
```

`read(target, context?)` returns the current canonical record synchronously or as
a promise, and throws or rejects when the target is unavailable. Existing
one-argument synchronous callbacks remain valid. AltEditorLite calls the method
while capturing and revalidating single Edit, multi-record Edit, and Remove
targets. A successful Edit with `editing.dialog.closeOnSuccess: false` reads the
canonical record again and updates the retained form.

```ts
const host = new StandaloneHost<UserRecord, string>({
  read: async (target, context) => {
    const record = await loadUser(target, context?.signal);
    if (record === undefined) {
      throw new Error('Record unavailable.');
    }
    return record;
  },
  // Apply callbacks are omitted here.
});
```

The optional `HostReadContext` contains the signal owned by the current editor
work. Forward it to application requests when possible. Cancelling an opening
request or destroying the editor stops the editor from waiting, and a late
result cannot mount or update a later dialog even when the data source does not
observe the signal. A read failure is reported through the normal error hook and
does not leave a partial form mounted. The editor may read a target more than
once as identity is checked around callbacks and persistence, so implementations
should be side-effect free and return the latest canonical record on every call.

`applyCreate`, `applyUpdate`, and `applyRemove` receive canonical operation
results after persistence succeeds. Each callback may return synchronously or
with a promise. Resolve only after the application-owned presentation is stable.
Create and Update may return the target that identifies the applied record.
Each callback also receives a `HostApplyContext` with the owning operation,
presentation mode, and cancellation signal.

Create also requires `operations.create` or `clientSide.createRow` to produce a
complete record. Edit uses `operations.update`, `clientSide.updateRow`, or the
safe declared-field merge before calling `applyUpdate`. Remove calls
`operations.remove` first when configured and then calls `applyRemove`.

`applyUpdates` is optional and enables multi-record Dialog Edit. It receives all
ordered canonical replacements after `operations.updateMany`,
`clientSide.updateRow`, or the safe merge has completed successfully. Resolve
only after the application view reflects the complete set. Without this callback,
`openBatchEditDialog` is unavailable while Create, single Edit, Remove, and
Refresh continue to work normally:

```ts
await editor.openBatchEditDialog(['user-1', 'user-2']);
```

## Record enumeration and uniqueness

The optional `records` provider exposes the records currently known to the Host:

```ts
records: () =>
  [...records].map(([target, row]) => ({
    row,
    target,
  })),
```

Configure it when any field uses `unique: true`. Local uniqueness checks enumerate
this provider and exclude the captured Edit target. They remain a browser
usability check; the persistence layer must enforce authoritative uniqueness for
remote, partial, or concurrently changing data.

## Refresh

The optional `refresh(signal)` callback defines the Host's default refresh work:

```ts
refresh: async (signal) => {
  const nextRecords = await loadRecords(signal);
  records.clear();
  for (const record of nextRecords) {
    records.set(record.id, record);
  }
  renderRecords(records);
},
```

`editor.refresh()` invokes this callback when `operations.refresh` is not
configured. Without either callback, refresh completes without changing records.
When `operations.refresh` is configured, it owns the refresh and any resulting
record or UI changes. The Host callback receives its `AbortSignal` directly;
`operations.refresh` receives the same signal through its operation context.

## Events and cleanup

Lifecycle events are dispatched from `host.eventTarget`. Supply an application
`EventTarget` when another component needs to observe editor activity, or omit it
to use the Host's private event target:

```ts
const events = new EventTarget();
const host = new StandaloneHost({
  eventTarget: events,
  read,
});

events.addEventListener('alteditor-lite:success', (event) => {
  if (event instanceof CustomEvent) {
    console.log(event.detail.operation);
  }
});
```

Call `editor.destroy()` before discarding the owning screen, replacing the Host,
or constructing another editor for the same `ownershipKey`. Destruction aborts
owned work, removes editor DOM and listeners, releases ownership, and destroys
the Host wrapper. It does not delete records from the application data store.

See the [Standalone example](../examples/standalone/README.md) for a complete
in-memory setup.
