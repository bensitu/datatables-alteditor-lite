import DataTable, { type Api } from 'datatables.net';

/**
 * Row shape shared by integration tests that use a real DataTables instance.
 */
export interface TestRow {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
}

/**
 * DataTables instance and owned table element created for an integration test.
 */
export interface TestTable {
  readonly api: Api<TestRow>;
  readonly tableElement: HTMLTableElement;
}

const activeTestTables = new Set<Api<TestRow>>();

let previousErrorMode: typeof DataTable.ext.errMode | undefined;

/**
 * Creates a real DataTables instance using only public initialization options.
 *
 * @param tableId - DOM identity assigned to the table element.
 * @param additionalOptions - Public options that extend the default fixture.
 * @returns The initialized API and its table element.
 */
export function createTestTable(
  tableId = 'test-table',
  additionalOptions: object = {},
): TestTable {
  previousErrorMode ??= DataTable.ext.errMode;
  DataTable.ext.errMode = 'throw';
  const tableElement = document.createElement('table');
  const header = tableElement.createTHead();
  const headerRow = header.insertRow();

  for (const heading of ['Name', 'Rank']) {
    const headerCell = document.createElement('th');
    headerCell.textContent = heading;
    headerRow.append(headerCell);
  }

  tableElement.createTBody();
  tableElement.id = tableId;
  document.body.append(tableElement);

  const api = new DataTable<TestRow>(tableElement, {
    data: [
      { id: 'row-a', name: 'Alpha', rank: 1 },
      { id: 'row-b', name: 'Beta', rank: 2 },
      { id: 'row-c', name: 'Gamma', rank: 3 },
      { id: 'row-d', name: 'Delta', rank: 4 },
      { id: 'row-e', name: 'Epsilon', rank: 5 },
    ],
    columns: [{ data: 'name' }, { data: 'rank' }],
    order: [[1, 'asc']],
    pageLength: 2,
    rowId: 'id',
    ...additionalOptions,
  });

  activeTestTables.add(api);

  return {
    api,
    tableElement,
  };
}

/**
 * Destroys every fixture instance and restores an empty document body.
 */
export function destroyTestTables(): void {
  for (const api of activeTestTables) {
    const tableElement = api.table().node();

    if (DataTable.isDataTable(tableElement)) {
      api.destroy();
    }
  }

  activeTestTables.clear();
  if (previousErrorMode !== undefined) {
    DataTable.ext.errMode = previousErrorMode;
    previousErrorMode = undefined;
  }
  document.body.replaceChildren();
}
