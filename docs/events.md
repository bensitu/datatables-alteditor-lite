# Events

AltEditorLite publishes observation-only `CustomEvent` objects from
`host.eventTarget`. `DataTablesHost` uses the owned table element:

```ts
const tableElement = table.table().node();

tableElement.addEventListener('alteditor-lite:error', (event) => {
  if (event instanceof CustomEvent) {
    console.log(event.detail.operation, event.detail.error.code);
  }
});
```

Events do not bubble and are not cancelable. Listen directly on the configured
event target. `StandaloneHost` uses an application-supplied `EventTarget` or
creates a private one exposed through `host.eventTarget`.

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

Inline Edit uses the existing event family:

```text
open
submit
success | error
close (when the inline presentation actually closes)
```

Inline details use `operation: 'edit'`, `mode: 'inline'`, and a neutral `target`
containing an optional Host key and affected field paths. Dialog details use
`mode: 'dialog'`. Programmatic refresh details use `mode: 'api'`. No separate
inline event names are required.

If Create or Edit form construction or source-value population fails, the editor
cleans up and returns to `ready`, then publishes `error` without a preceding
`open` or a following `close` event.

`submit` occurs after validation, collection, and target validation but before the
persistence callback. `success` occurs after canonical Host application and
stable presentation. `error` occurs after safe normalization without an editor
Host mutation. `close` occurs after dialog cleanup, focus restoration, and target
release.

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

Every detail contains `editor`, `type`, and a `mode`. It also contains an
`operation` discriminator where the event represents an operation. Edit details
may contain a `target`; inline Edit always provides one.

Create and Edit submit details contain collected `values`. Edit also contains the
captured `original` row. Remove submit details contain the captured readonly
`rows`.

Success details are discriminated by operation:

- Create contains `values` and the added `row`.
- Edit contains `values`, `original`, and the replacement `row`.
- Remove contains the captured readonly `rows`.
- Refresh contains no row payload.

Error details contain the normalized `AltEditorLiteError`. Close details contain
the action and a reason of `api`, `cancel`, `escape`, `success`, `unchanged`, or
`redraw`. Inline external draws use `redraw`, and submission with no changed value
uses `unchanged`.
