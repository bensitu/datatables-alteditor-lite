# AG Grid Community

Use the `/ag-grid` ESM entry to edit ordinary records in AG Grid Community's
Client-Side Row Model. It supports dialog Create, Edit, multi-record Edit,
Remove and Refresh. The application supplies the grid and its modules.

```bash
npm install datatables-alteditor-lite ag-grid-community@^36.3.0
```

## Create an editor

```ts
import { AllCommunityModule, createGrid } from 'ag-grid-community';
import { AgGridHost, AltEditorLite } from 'datatables-alteditor-lite/ag-grid';
import 'datatables-alteditor-lite/style.css';

interface Sale {
  id: string;
  region: string;
  units: number;
}

const container = document.querySelector<HTMLElement>('#sales');
if (!container) throw new Error('The sales grid container is missing.');
const api = createGrid<Sale>(
  container,
  {
    columnDefs: [{ field: 'region' }, { field: 'units' }],
    rowData: [{ id: 'north', region: 'North', units: 24 }],
    getRowId: ({ data }) => data.id,
    rowSelection: { mode: 'multiRow' },
  },
  { modules: [AllCommunityModule] },
);

const host = new AgGridHost(api);
const editor = new AltEditorLite(host, {
  fields: [
    { name: 'region', type: 'text', label: 'Region', required: true },
    { name: 'units', type: 'number', label: 'Units', required: true },
  ],
  clientSide: {
    createRow: (values) => ({
      id: crypto.randomUUID(),
      region: values.region ?? '',
      units: values.units ?? 0,
    }),
  },
});

await editor.openEditDialog('north');
```

Give the grid container a height. For modular builds, register
`ClientSideRowModelModule`, `ClientSideRowModelApiModule`, `RowApiModule`,
`RenderApiModule` and `EventApiModule`. Register `RowSelectionModule` for
selection-based commands. Add any modules required by your own columns.

The host accepts an existing grid API through the structural `AgGridApi<TRow>`
interface. It uses public grid methods and does not register modules. A grid API
can be owned by one active editor. Lifecycle events are dispatched directly on
`host.eventTarget`, the element returned by `api.getGridElement()`.

## Targets and persistence

- Supply a pure `getRowId` function that returns a unique, nonempty string.
  An Edit result must retain the same ID. Explicit targets are business IDs
  such as `'north'`. With row selection enabled, `openEditDialog()`,
  `openBatchEditDialog()` and `openRemoveDialog()` capture the current selection.
- Records are resolved against loaded data at opening and submission. A change
  in sort, filter, page or selection preserves the original target. A missing or
  ambiguous record prevents the operation. Validate ID uniqueness when loading
  application data, including data that the grid might coalesce by ID.
- Local uniqueness checks include loaded rows outside the filter or current
  page. Use server-side validation for authoritative uniqueness and concurrent
  updates. The supported data model is flat. Group and aggregate rows, pinned
  rows, trees, server-side row models and inline editing are outside this integration.
- Configure the existing `operations` callbacks for remote persistence.
  Return complete canonical records from Create and Edit. The host replaces the
  entire row and flushes the grid's rendering queue before reporting success.
  This also applies when a filtered record has no rendered cell.
- Multi-record Edit requires at least two distinct IDs. Remote batch persistence
  uses a single `operations.updateMany` call that returns one complete record
  per target in the original order. With only `operations.update` configured,
  the editor offers single-record Edit.

The host checks all targets before a transaction and checks the returned node
IDs. On a failed or partial application it attempts to restore the affected
local records. During removal it restores only rows that the grid confirmed
it removed, using their original positions and selection. If persistence
already succeeded, a view error can have
`committed: true`. Reload the authoritative data before retrying a write.
See [Operations](operations.md) for cancellation and error recovery.

## Refresh and cleanup

`editor.refresh()` recomputes the client-side row model and flushes rendering.
To reload remote data, implement `operations.refresh({ signal })`, pass the
signal to the request, and call `api.setGridOption('rowData', records)` after
checking the signal. Local-only applications can omit this callback.

Call `editor.destroy()` when removing the editor, then `api.destroy()` when
removing the grid. Destroying the host releases its listener and cancels
pending host work. If the grid is destroyed first, its `gridPreDestroyed` event
destroys the active editor, closes its dialog and aborts pending operation signals.

[Runnable example](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/tables/ag-grid.html) ·
[Example source](../examples/demo/tables/ag-grid.js) ·
[AG Grid transaction updates](https://www.ag-grid.com/javascript-data-grid/data-update-transactions/)
