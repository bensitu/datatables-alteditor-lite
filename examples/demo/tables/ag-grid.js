import { AgGridHost, AltEditorLite } from '../../../dist/esm/ag-grid.js';

import {
  initialSales,
  observeSales,
  reportSalesError,
  saveSales,
  unitsField,
} from './sales.js';

const records = new Map(initialSales().map((row) => [row.id, row]));
const readSales = () => Array.from(records.values(), (row) => ({ ...row }));
const api = globalThis.agGrid.createGrid(document.querySelector('#sales'), {
  theme: 'legacy',
  rowData: readSales(),
  getRowId: ({ data }) => data.id,
  rowSelection: { mode: 'multiRow', enableClickSelection: true },
  defaultColDef: { flex: 1, minWidth: 90, sortable: true, filter: true },
  columnDefs: [{ field: 'region', sort: 'asc' }, { field: 'units' }],
});
const host = new AgGridHost(api);
const editor = new AltEditorLite(host, {
  fields: [
    {
      name: 'region',
      label: 'Region',
      type: 'text',
      trim: true,
      required: true,
      unique: true,
      batchEditable: false,
    },
    unitsField,
  ],
  operations: {
    async create(values, { signal }) {
      await saveSales(signal);
      const row = { id: crypto.randomUUID(), region: values.region, units: values.units };
      records.set(row.id, row);
      return row;
    },
    async update(values, original, { signal }) {
      await saveSales(signal);
      const row = { ...original, ...values };
      records.set(row.id, row);
      return row;
    },
    async updateMany(changes, originals, { signal }) {
      await saveSales(signal);
      const rows = originals.map((original) => ({ ...original, ...changes }));
      for (const row of rows) records.set(row.id, row);
      return rows;
    },
    async remove(originals, { signal }) {
      await saveSales(signal);
      for (const row of originals) records.delete(row.id);
    },
    refresh() {
      api.setGridOption('rowData', readSales());
    },
  },
});
const edit = document.querySelector('#edit');
const remove = document.querySelector('#remove');
api.addEventListener('selectionChanged', () => {
  edit.disabled = remove.disabled = api.getSelectedNodes().length === 0;
});
edit.addEventListener('click', () => {
  const open =
    api.getSelectedNodes().length === 1
      ? editor.openEditDialog()
      : editor.openBatchEditDialog();
  void open.catch(reportSalesError);
});
document.querySelector('#create').addEventListener('click', () => {
  void editor.openCreateDialog({ units: 0 }).catch(reportSalesError);
});
remove.addEventListener('click', () => {
  void editor.openRemoveDialog().catch(reportSalesError);
});
document.querySelector('#refresh').addEventListener('click', () => {
  void editor.refresh().catch(reportSalesError);
});
observeSales(editor, host.eventTarget, readSales, () => api.destroy());
