import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const buttonsScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-buttons/js/dataTables.buttons.js',
);
const selectScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-select/js/dataTables.select.js',
);

interface BrowserRowApi {
  select(): BrowserRowApi;
}

interface BrowserRowsApi {
  count(): number;
}

interface BrowserTableApi {
  destroy(): BrowserTableApi;
  draw(redrawPaging?: boolean): BrowserTableApi;
  off(eventName: string, listener: (event: Event) => void): BrowserTableApi;
  on(eventName: string, listener: (event: Event) => void): BrowserTableApi;
  row(rowIndex: number): BrowserRowApi;
  rows(modifier: { readonly selected: boolean }): BrowserRowsApi;
  table(): {
    node(): HTMLTableElement;
  };
}

interface BrowserDataTableStatic {
  new (selector: string, options: Readonly<Record<string, unknown>>): BrowserTableApi;
  isDataTable(tableElement: HTMLTableElement): boolean;
}

test('core, Buttons, and Select operate without a jQuery global', async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <table id="runtime-table">
          <thead>
            <tr><th>Name</th></tr>
          </thead>
          <tbody>
            <tr><td>Alpha</td></tr>
            <tr><td>Beta</td></tr>
          </tbody>
        </table>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: buttonsScriptPath });
  await page.addScriptTag({ path: selectScriptPath });

  const runtimeResult = await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      DataTable?: BrowserDataTableStatic;
    };
    const dataTableStatic = runtimeScope.DataTable;

    if (dataTableStatic === undefined) {
      throw new Error('Expected the DataTables browser global.');
    }

    const tableElement = document.querySelector<HTMLTableElement>('#runtime-table');
    if (tableElement === null) {
      throw new Error('Expected the runtime test table element.');
    }

    const tableApi = new dataTableStatic('#runtime-table', {
      layout: {
        topStart: {
          buttons: ['copy'],
        },
      },
      select: true,
    });
    let drawEventCount = 0;
    const drawListener = (event: Event): void => {
      if (event.type === 'draw') {
        drawEventCount += 1;
      }
    };

    tableApi.on('draw.test', drawListener);
    tableApi.draw(false);
    tableApi.off('draw.test', drawListener);
    tableApi.draw(false);
    tableApi.row(0).select();

    const result = {
      drawEventCount,
      hasJQuery: 'jQuery' in globalThis,
      isApiNodeOwned: tableApi.table().node() === tableElement,
      selectedRowCount: tableApi.rows({ selected: true }).count(),
    };

    tableApi.destroy();

    return {
      ...result,
      isDestroyed: !dataTableStatic.isDataTable(tableElement),
    };
  });

  expect(runtimeResult).toEqual({
    drawEventCount: 1,
    hasJQuery: false,
    isApiNodeOwned: true,
    selectedRowCount: 1,
    isDestroyed: true,
  });
});
