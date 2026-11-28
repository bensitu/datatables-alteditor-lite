import { EditorTargetUnavailableError } from '../../../dist/esm/standalone.js';

import { editSalesRecords, initialSales } from './sales.js';

const table = globalThis.jQuery('#sales').bootstrapTable({
  data: initialSales(),
  uniqueId: 'id',
  pagination: true,
  pageSize: 2,
  pageList: [2, 5],
  sortName: 'region',
  sortOrder: 'asc',
  escape: true,
  columns: [
    { field: 'region', title: 'Region', sortable: true },
    { field: 'units', title: 'Units', sortable: true },
  ],
});
function read(id) {
  const row = table.bootstrapTable('getRowByUniqueId', id);
  if (row == null) throw new EditorTargetUnavailableError();
  return row;
}
editSalesRecords({
  rows: () => table.bootstrapTable('getData', { unfiltered: true }),
  read,
  applyUpdate(id, row) {
    read(id);
    table.bootstrapTable('updateByUniqueId', { id, row, replace: true });
    return id;
  },
  dispose: () => table.bootstrapTable('destroy'),
});
