# Standalone Browser Global example

This example uses `datatables-alteditor-lite-standalone.js` without DataTables or
another grid runtime. Application state is connected through `StandaloneHost`
callbacks, and lifecycle events are observed through the supplied `EventTarget`.

Run `npm run build`, start `npm run demo`, and open
`/examples/standalone/`. Create, Edit, and Remove update the record card only
after the corresponding consumer callback completes.

The same setup is available through ESM:

```ts
import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';

const host = new StandaloneHost({
  read,
  applyCreate,
  applyUpdate,
  applyRemove,
  eventTarget,
});
const editor = new AltEditorLite(host, { fields });
```

Add a `records` provider when any field uses local uniqueness validation. Add a
`refresh` callback when `editor.refresh()` should perform consumer-owned work;
without it, the call completes without changing records.
