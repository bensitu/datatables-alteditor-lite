# Orders and order lines

Run `npm run build` and `npm run demo`, then open
[the reference examples](http://127.0.0.1:4173/examples/demo/reference.html#parent-child).
The implementation is [parent-child.js](../demo/parent-child.js).

Two independent `AltEditorLite` instances use `StandaloneHost` and asynchronous
`operations.create` / `operations.update`. The application owns order selection,
record maps, and the parent id captured by each line editor's operations. The
child host checks that a requested line belongs to that parent.

Selecting an order destroys the previous child editor, aborting its pending work,
then creates an editor bound to the new parent. A newly created order receives a
canonical id from the simulated service before child editing becomes available
for it. Child Create includes this captured id; Child Edit preserves it. The
parent editor keeps its independent lifetime. Both instances are destroyed on
page exit. A rejected child operation leaves parent data unchanged; enter
`Unavailable` as the product to exercise field errors and retry.

The delay observes the operation signal before returning a canonical row. Hosts
apply rows only after successful persistence. To replace the mock with a service,
send the captured parent id with the request and authorize that relationship on
the server.

## Transaction boundary

Frontend coordination is not a database transaction. For an atomic order and
lines save, submit one aggregate request such as
`POST /orders` with `{ order, lines }`. The backend validates and writes both in
one database transaction and returns canonical records. Independent editor saves
in this example do not provide that atomicity.

## Implementation notes

The existing public APIs are sufficient. No core workaround or private state
access was required. Recreating the child editor uses public `destroy()` to end
the previous context; capturing parent identity and authorizing relations remain
application responsibilities.
