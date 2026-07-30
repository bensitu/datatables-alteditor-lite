---
audience: public
status: stable
---

# Events

AltEditorLite publishes observation-only DOM `CustomEvent` objects from the owned
table element:

```ts
const tableElement = table.table().node();

tableElement.addEventListener('alteditor-lite:error', (event) => {
  if (event instanceof CustomEvent) {
    console.log(event.detail.operation, event.detail.error.code);
  }
});
```

Events do not bubble and are not cancelable. Listen directly on
`table.table().node()`.

## Event names

- `alteditor-lite:open`
- `alteditor-lite:submit`
- `alteditor-lite:success`
- `alteditor-lite:error`
- `alteditor-lite:close`
- `alteditor-lite:refresh`
- `alteditor-lite:destroy`

## Ordering

Create, Edit, and Remove publish:

```text
open
submit
success | error
close (when the dialog actually closes)
```

`submit` occurs after validation, collection, and target validation but before the
persistence callback. `success` occurs after DataTables mutation and draw.
`error` occurs after safe UI mapping without an AltEditorLite table mutation.
`close` occurs after dialog cleanup, focus restoration, and snapshot release.

Refresh publishes:

```text
refresh { phase: 'start' }
success | error
refresh { phase: 'complete' }
```

Aborted or stale requests do not publish success or error. Destroy is published
once after owned DOM, listeners, operations, snapshots, and instance storage are
cleaned up.

## Detail discriminators

Every detail contains `editor`, `type`, and an `operation` discriminator where the
event represents an operation.

Create and Edit submit details contain collected `values`. Edit also contains the
captured `original` row. Remove submit details contain the captured readonly
`rows`.

Success details are discriminated by operation:

- Create contains `values` and the added `row`.
- Edit contains `values`, `original`, and the replacement `row`.
- Remove contains the captured readonly `rows`.
- Refresh contains no row payload.

Error details contain the normalized `AltEditorLiteError`. Close details contain
the dialog action and a reason of `api`, `cancel`, `escape`, or `success`.
