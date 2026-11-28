import { editSalesView, initialSales } from './sales.js';

const records = initialSales();
const table = new globalThis.VTable.ListTable({
  container: document.querySelector('#sales'),
  records,
  widthMode: 'adaptive',
  sortState: { field: 'units', order: 'asc' },
  defaultRowHeight: 40,
  defaultHeaderRowHeight: 40,
  columns: [
    { field: 'region', title: 'Region', sort: true },
    { field: 'units', title: 'Units', sort: true },
  ],
});
const open = editSalesView(
  records,
  (rows) => {
    table.setRecords(rows, { sortState: table.sortState });
  },
  () => table.release(),
);
table.on('dblclick_cell', ({ col, row }) => {
  if (table.isHeader(col, row)) return;
  const record = table.getCellOriginRecord(col, row);
  if (record?.id !== undefined) open(record.id);
});
