import DataTable, { type Api } from 'datatables.net';

/**
 * Row shape shared by the permanent DataTables public-contract tests.
 */
export interface ContractRow {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
}

/**
 * DataTables instance and owned table element created for a contract test.
 */
export interface ContractTable {
  readonly api: Api<ContractRow>;
  readonly tableElement: HTMLTableElement;
}

const activeContractTables = new Set<Api<ContractRow>>();

/**
 * Creates a real DataTables instance using only public initialization options.
 *
 * @param tableId - DOM identity assigned to the table element.
 * @param additionalOptions - Public options that extend the baseline fixture.
 * @returns The initialized API and its table element.
 */
export function createContractTable(
  tableId = 'contract-table',
  additionalOptions: object = {},
): ContractTable {
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

  const api = new DataTable<ContractRow>(tableElement, {
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

  activeContractTables.add(api);

  return {
    api,
    tableElement,
  };
}

/**
 * Destroys every fixture instance and restores an empty document body.
 */
export function destroyContractTables(): void {
  for (const api of activeContractTables) {
    const tableElement = api.table().node();

    if (DataTable.isDataTable(tableElement)) {
      api.destroy();
    }
  }

  activeContractTables.clear();
  document.body.replaceChildren();
}
