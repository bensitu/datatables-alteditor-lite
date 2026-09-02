import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const browserBundlePath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');
const keyTableScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-keytable/js/dataTables.keyTable.js',
);
const colReorderScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-colreorder/js/dataTables.colReorder.js',
);
const scrollerScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-scroller/js/dataTables.scroller.js',
);

interface RenderedControlsRuntime {
  readonly editor?: {
    destroy(): void;
    openEditDialog(row: string): Promise<void>;
    openInlineEdit(row: string, column: string): Promise<void>;
    submitInlineEdit(): Promise<void>;
  };
  readonly tableApi?: {
    row(row: string): {
      data(): { readonly schedule: string; readonly status: string };
    };
  };
}

interface ScrollerRuntime {
  readonly editor: {
    openInlineEdit(row: string, column: string): Promise<void>;
    submitInlineEdit(): Promise<void>;
  };
  readonly tableApi: {
    row(row: string): {
      data(): { readonly office: string };
    };
    readonly scroller: {
      toPosition(index: number, animate?: boolean): void;
    };
  };
}

async function createInlineFixture(
  page: Page,
  inlineActivation: 'doubleClick' | 'hover' = 'doubleClick',
): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite inline browser test</title></head>
      <body>
        <main>
          <table id="inline-table">
            <thead><tr><th>Name</th><th>Rank</th><th>Start date</th></tr></thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#inline-table', {
        columns: [
          { data: 'name', name: 'displayName' },
          { data: 'rank', name: 'rank' },
          { data: 'startDate', name: 'startDate' }
        ],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1, startDate: '2024-01-09' },
          { id: 'row-b', name: 'Beta', rank: 2, startDate: '2025-02-10' }
        ],
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          fields: [
            {
              inlineEdit: true,
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              inlineEdit: true,
              label: 'Rank',
              name: 'rank',
              required: true,
              type: 'number'
            },
            {
              inlineEdit: true,
              label: 'Start date',
              name: 'startDate',
              required: true,
              type: 'date'
            }
          ],
          editing: {
            dialog: { enabled: false },
            inline: { activation: '${inlineActivation}', enabled: true }
          },
          operations: {
            async update(values, original) {
              await new Promise(resolve => globalThis.setTimeout(resolve, 20));
              return {
                ...original,
                name: values.name ?? original.name,
                rank: values.rank ?? original.rank,
                startDate: values.startDate ?? original.startDate
              };
            }
          }
        }
      );
    `,
  });
}

async function createSearchSelectInlineFixture(
  page: Page,
  options: {
    readonly useScroller?: boolean;
    readonly useVerticalScroll?: boolean;
  } = {},
): Promise<void> {
  const shouldUseScroller = options.useScroller ?? false;
  const shouldUseVerticalScroll =
    (options.useVerticalScroll ?? false) || shouldUseScroller;
  const rows = shouldUseScroller
    ? Array.from({ length: 120 }, (_, index) => ({
        id: `scroller-row-${String(index)}`,
        office: 'beijing',
      }))
    : shouldUseVerticalScroll
      ? Array.from({ length: 8 }, (_, index) => ({
          id: `row-${String.fromCharCode(97 + index)}`,
          office: 'beijing',
        }))
      : [{ id: 'row-a', office: 'beijing' }];
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite SearchSelect inline browser test</title></head>
      <body>
        <main>
          <table id="search-select-inline-table">
            <thead><tr><th>Office</th></tr></thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  if (shouldUseVerticalScroll) {
    await page.addStyleTag({
      content: '#search-select-inline-table td { height: 3rem; }',
    });
  }
  await page.addScriptTag({ path: dataTablesScriptPath });
  if (shouldUseScroller) {
    await page.addScriptTag({ path: scrollerScriptPath });
  }
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#search-select-inline-table', {
        columns: [{ data: 'office', name: 'office' }],
        data: ${JSON.stringify(rows)},
        ${
          shouldUseScroller
            ? "deferRender: true, pageLength: 25, scrollY: '8rem', scroller: { rowHeight: 48 },"
            : shouldUseVerticalScroll
              ? "paging: false, scrollY: '8rem',"
              : ''
        }
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          editing: {
            dialog: { enabled: false },
            inline: { activation: 'hover', enabled: true }
          },
          fields: [
            {
              allowClear: true,
              inlineEdit: true,
              label: 'Office',
              name: 'office',
              options: [
                { label: 'Tokyo', value: 'tokyo' },
                { label: 'Beijing', value: 'beijing' },
                { label: 'London', value: 'london' },
                { label: 'Berlin', value: 'berlin' },
                { label: 'Sydney', value: 'sydney' },
                { label: 'Singapore', value: 'singapore' },
                { label: 'Dubai', value: 'dubai' },
                { label: 'Closed', value: 'closed' }
              ],
              search: { enabled: false },
              type: 'search-select'
            }
          ]
        }
      );
    `,
  });
}

async function createRenderedControlsFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite rendered controls browser test</title></head>
      <body>
        <main>
          <table id="rendered-controls-table">
            <thead><tr><th>Status</th><th>Schedule</th></tr></thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#rendered-controls-table', {
        columns: [
          { data: 'status', name: 'status' },
          { data: 'schedule', name: 'schedule' }
        ],
        columnDefs: [
          {
            targets: 0,
            render(data, type) {
              if (type !== 'display') return data;
              return '<select aria-label="Rendered status" disabled>' +
                '<option value="open"' + (data === 'open' ? ' selected' : '') + '>Open</option>' +
                '<option value="closed"' + (data === 'closed' ? ' selected' : '') + '>Closed</option>' +
                '<option value="paused"' + (data === 'paused' ? ' selected' : '') + '>Paused</option>' +
                '</select>';
            }
          },
          {
            targets: 1,
            render(data, type) {
              if (type !== 'display') return data;
              return '<input aria-label="Rendered schedule" type="time" value="' + data + '" disabled>';
            }
          }
        ],
        data: [{ id: 'row-a', schedule: '09:00', status: 'open' }],
        rowId: 'id'
      });
      globalThis.editorOptions = {
          clientSide: {
            updateRow(original, values) {
              return {
                ...original,
                schedule: values.schedule ?? original.schedule,
                status: values.status ?? original.status
              };
            }
          },
          fields: [
            {
              inlineEdit: true,
              label: 'Status',
              name: 'status',
              options: [
                { label: 'Open', value: 'open' },
                { label: 'Closed', value: 'closed' },
                { label: 'Paused', value: 'paused' }
              ],
              required: true,
              type: 'select'
            },
            {
              inlineEdit: true,
              label: 'Schedule',
              name: 'schedule',
              required: true,
              type: 'time'
            }
          ],
      };
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          ...globalThis.editorOptions,
          editing: {
            dialog: { enabled: true },
            inline: { enabled: true }
          }
        }
      );
    `,
  });
}

async function createExtensionInlineFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite extension inline test</title></head>
      <body>
        <table id="extension-inline-table">
          <thead><tr><th>Name</th><th>Rank</th></tr></thead>
          <tbody></tbody>
        </table>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: keyTableScriptPath });
  await page.addScriptTag({ path: colReorderScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#extension-inline-table', {
        colReorder: true,
        columns: [
          { data: 'name', name: 'name' },
          { data: 'rank', name: 'rank' }
        ],
        data: [{ id: 'row-a', name: 'Alpha', rank: 1 }],
        keys: true,
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          editing: {
            dialog: { enabled: false },
            inline: {
              activation: 'hover', enabled: true,
              keyboardActivation: [{ key: 'F2' }, { key: 'Enter' }, { key: ' ' }]
            }
          },
          fields: [
            { inlineEdit: true, label: 'Name', name: 'name', type: 'text' },
            { inlineEdit: true, label: 'Rank', name: 'rank', type: 'number' }
          ]
        }
      );
    `,
  });
}

test('submits and moves through eligible cells with the keyboard', async ({ page }) => {
  await createInlineFixture(page);
  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & {
      editor?: { openInlineEdit(row: string, column: string): Promise<void> };
    };
    await runtimeScope.editor?.openInlineEdit('#row-a', 'displayName:name');
  });

  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toBeFocused();
  await nameInput.fill('Keyboard Alpha');
  await page.keyboard.press('Tab');

  await expect(page.locator('#row-a')).toContainText('Keyboard Alpha');
  await expect(page.getByRole('spinbutton', { name: 'Rank' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(page.locator('#row-a')).toContainText('1');
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('opens by double click and has no serious inline accessibility violations', async ({
  page,
}) => {
  await createInlineFixture(page);
  await page.locator('#row-b td').first().dblclick();

  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toHaveValue('Beta');
  const scan = await new AxeBuilder({ page }).include('.alteditor-lite-inline').analyze();
  expect(
    scan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.locator('#row-b')).toContainText('Beta');
});

test('opens the hover pencil and exposes accessible explicit actions', async ({
  page,
}) => {
  await createInlineFixture(page, 'hover');
  const cell = page.locator('#row-b td').first();
  await cell.hover();
  const trigger = cell.getByRole('button', { name: 'Edit cell' });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toHaveValue('Beta');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  const inputFocus = await nameInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  const editingBorder = await cell.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      color: style.borderLeftColor,
      style: style.borderLeftStyle,
      width: Number.parseFloat(style.borderLeftWidth),
    };
  });
  expect(inputFocus.style).toBe('solid');
  expect(inputFocus.width).toBeGreaterThan(0);
  expect(inputFocus.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(editingBorder.style).toBe('solid');
  expect(editingBorder.width).toBeGreaterThan(0);
  expect(editingBorder.color).toBe('rgba(0, 0, 0, 0)');
  const scan = await new AxeBuilder({ page }).include('.alteditor-lite-inline').analyze();
  expect(
    scan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#row-b')).toContainText('Beta');
});

test('keeps the hover input usable in a narrow column', async ({ page }) => {
  await createInlineFixture(page, 'hover');
  await page.addStyleTag({
    content: `
      #inline-table_wrapper {
        width: 14rem;
      }

      #inline-table {
        table-layout: fixed;
        width: 14rem !important;
      }

      #inline-table colgroup col:nth-child(2),
      #inline-table th:nth-child(2),
      #inline-table td:nth-child(2) {
        width: 4rem !important;
      }
    `,
  });
  const cell = page.locator('#row-b td').nth(1);
  await cell.hover();
  await cell.getByRole('button', { name: 'Edit cell' }).click();

  const layout = await page.locator('.alteditor-lite-inline').evaluate((element) => {
    const input = element.querySelector('input');
    const action = element.querySelector('.alteditor-lite-inline__action');
    const actions = element.querySelectorAll('.alteditor-lite-inline__action');
    const cellElement = element.closest('td');
    const lastAction = actions.item(actions.length - 1);
    if (input === null || action === null || cellElement === null) {
      throw new Error('Expected a mounted narrow inline editor.');
    }
    const cellRect = cellElement.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    const lastActionRect = lastAction.getBoundingClientRect();
    return {
      actionTop: actionRect.top,
      actionWidth: actionRect.width,
      bottomGap: cellRect.bottom - actionRect.bottom,
      cellWidth: cellRect.width,
      inputBottom: inputRect.bottom,
      inputWidth: inputRect.width,
      rightGap: cellRect.right - lastActionRect.right,
    };
  });

  expect(layout.cellWidth).toBeLessThan(96);
  expect(layout.inputWidth).toBeGreaterThanOrEqual(layout.actionWidth);
  expect(layout.actionTop).toBeGreaterThanOrEqual(layout.inputBottom);
  expect(layout.bottomGap).toBeGreaterThanOrEqual(2);
  expect(layout.rightGap).toBeGreaterThanOrEqual(2);
  await page.getByRole('spinbutton', { name: 'Rank' }).fill('7');
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('moves actions clear of a constrained native date control', async ({ page }) => {
  await createInlineFixture(page, 'hover');
  await page.addStyleTag({
    content: `
      #inline-table_wrapper,
      #inline-table {
        width: 24rem !important;
      }

      #inline-table colgroup col:nth-child(3),
      #inline-table th:nth-child(3),
      #inline-table td:nth-child(3) {
        width: 9rem !important;
      }
    `,
  });
  const cell = page.locator('#row-b td').nth(2);
  await cell.hover();
  await cell.getByRole('button', { name: 'Edit cell' }).click();

  const layout = await page.locator('.alteditor-lite-inline').evaluate((element) => {
    const input = element.querySelector('input[type="date"]');
    const actions = element.querySelector('.alteditor-lite-inline__actions');
    if (input === null || actions === null) {
      throw new Error('Expected a mounted date inline editor.');
    }
    const inputRect = input.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      actionsTop: actionsRect.top,
      inputBottom: inputRect.bottom,
    };
  });

  expect(layout.actionsTop).toBeGreaterThanOrEqual(layout.inputBottom);
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('keeps a keyboard-only choice popup above the editing cell border', async ({
  page,
}) => {
  await createSearchSelectInlineFixture(page);
  await page.addStyleTag({ content: '#row-a td { height: 8rem; }' });
  const cell = page.locator('#row-a td').first();
  await cell.hover();
  await cell.getByRole('button', { name: 'Edit cell' }).click();
  const combobox = page.getByRole('combobox', { name: 'Office' });
  await combobox.focus();
  await expect(combobox).toHaveJSProperty('readOnly', true);
  await expect(combobox).toHaveAttribute('aria-autocomplete', 'none');
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();

  const layers = await cell.evaluate((element) => {
    const listbox = element.querySelector('.alteditor-lite-search-select__listbox');
    if (listbox === null) {
      throw new Error('Expected an open SearchSelect popup.');
    }
    const cellRect = element.getBoundingClientRect();
    const listboxRect = listbox.getBoundingClientRect();
    return {
      borderCrossesPopup:
        cellRect.bottom > listboxRect.top && cellRect.bottom < listboxRect.bottom,
      borderZIndex: Number.parseInt(getComputedStyle(element, '::after').zIndex, 10),
      popupZIndex: Number.parseInt(getComputedStyle(listbox).zIndex, 10),
    };
  });

  expect(layers.borderCrossesPopup).toBe(true);
  expect(layers.popupZIndex).toBeGreaterThan(layers.borderZIndex);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(cell).toContainText('beijing');
});

test('places a SearchSelect popup inside a vertical table scroll area', async ({
  page,
}) => {
  await page.setViewportSize({ height: 667, width: 375 });
  await createSearchSelectInlineFixture(page, { useVerticalScroll: true });
  const scrollBody = page.locator('.dt-scroll-body');
  await expect(scrollBody).toBeVisible();
  await scrollBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const cell = page.locator('#row-h td').first();
  await cell.hover();
  await cell.getByRole('button', { name: 'Edit cell' }).click();
  await page.getByRole('combobox', { name: 'Office' }).focus();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveClass(/alteditor-lite-search-select__listbox--above/);
  const layout = await listbox.evaluate((element) => {
    const scrollContainer = element.closest('.dt-scroll-body');
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error('Expected the listbox inside the table scroll area.');
    }

    const listboxRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const visibleTop = containerRect.top + scrollContainer.clientTop;
    return {
      listboxBottom: listboxRect.bottom,
      listboxTop: listboxRect.top,
      visibleBottom: visibleTop + scrollContainer.clientHeight,
      visibleTop,
    };
  });

  expect(layout.listboxTop).toBeGreaterThanOrEqual(layout.visibleTop - 1);
  expect(layout.listboxBottom).toBeLessThanOrEqual(layout.visibleBottom + 1);

  await listbox.evaluate(async (element) => {
    await new Promise<void>((resolve) => {
      element.addEventListener(
        'scroll',
        () => {
          requestAnimationFrame(() => {
            resolve();
          });
        },
        { once: true },
      );
      element.scrollTop = element.scrollHeight;
    });
  });
  const finalOptionLayout = await listbox.evaluate((element) => {
    const finalOption = element.lastElementChild;
    if (!(finalOption instanceof HTMLElement)) {
      throw new Error('Expected a final SearchSelect option.');
    }

    const listboxRect = element.getBoundingClientRect();
    const optionRect = finalOption.getBoundingClientRect();
    return {
      finalOptionBottom: optionRect.bottom,
      maximumScrollTop: element.scrollHeight - element.clientHeight,
      scrollTop: element.scrollTop,
      visibleBottom: listboxRect.top + element.clientTop + element.clientHeight,
    };
  });

  expect(finalOptionLayout.scrollTop).toBeGreaterThanOrEqual(
    finalOptionLayout.maximumScrollTop - 1,
  );
  expect(finalOptionLayout.finalOptionBottom).toBeLessThanOrEqual(
    finalOptionLayout.visibleBottom + 1,
  );
});

test('supports SearchSelect inline editing while Scroller reuses rows', async ({
  page,
}) => {
  await createSearchSelectInlineFixture(page, { useScroller: true });
  await expect(page.locator('.dt-container.dts')).toBeVisible();

  await page.evaluate(async () => {
    const runtime = globalThis as typeof globalThis & ScrollerRuntime;
    await runtime.editor.openInlineEdit('#scroller-row-0', 'office:name');
  });

  const scrollBody = page.locator('.dt-scroll-body');
  const combobox = page.getByRole('combobox', { name: 'Office' });
  await combobox.focus();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const tableScrollTop = await scrollBody.evaluate((element) => element.scrollTop);

  await page.keyboard.press('End');
  const optionLayout = await listbox.evaluate((element) => {
    const finalOption = element.lastElementChild;
    if (!(finalOption instanceof HTMLElement)) {
      throw new Error('Expected a final SearchSelect option.');
    }
    const listboxRect = element.getBoundingClientRect();
    const optionRect = finalOption.getBoundingClientRect();
    return {
      finalOptionBottom: optionRect.bottom,
      visibleBottom: listboxRect.top + element.clientTop + element.clientHeight,
    };
  });

  expect(optionLayout.finalOptionBottom).toBeLessThanOrEqual(
    optionLayout.visibleBottom + 1,
  );
  expect(await scrollBody.evaluate((element) => element.scrollTop)).toBe(tableScrollTop);

  await page.evaluate(() => {
    const runtime = globalThis as typeof globalThis & ScrollerRuntime;
    runtime.tableApi.scroller.toPosition(80, false);
  });

  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(page.locator('#scroller-row-80')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const runtime = globalThis as typeof globalThis & ScrollerRuntime;
      return runtime.tableApi.row('#scroller-row-0').data().office;
    }),
  ).toBe('beijing');

  await page.evaluate(async () => {
    const runtime = globalThis as typeof globalThis & ScrollerRuntime;
    await runtime.editor.openInlineEdit('#scroller-row-80', 'office:name');
  });
  await combobox.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(async () => {
    const runtime = globalThis as typeof globalThis & ScrollerRuntime;
    await runtime.editor.submitInlineEdit();
  });

  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const runtime = globalThis as typeof globalThis & ScrollerRuntime;
      return runtime.tableApi.row('#scroller-row-80').data().office;
    }),
  ).toBe('closed');

  await page.evaluate(() => {
    const runtime = globalThis as typeof globalThis & ScrollerRuntime;
    runtime.tableApi.scroller.toPosition(0, false);
  });
  await expect(page.locator('#scroller-row-0')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const runtime = globalThis as typeof globalThis & ScrollerRuntime;
      return runtime.tableApi.row('#scroller-row-0').data().office;
    }),
  ).toBe('beijing');
});

test('opens one inline editor for each KeyTable activation shortcut', async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => {
    errors.push(error);
  });
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>Keyboard editing</title></head><body><table id="keyboard-table"><thead><tr><th>Name</th></tr></thead></table></body></html>',
  );
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: keyTableScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
    globalThis.tableApi = new DataTable('#keyboard-table', {
      columns: [{ data: 'name', name: 'name' }],
      data: [{ id: 'row-a', name: 'Alpha' }],
      keys: true,
      rowId: 'id'
    });
    globalThis.editor = new AltEditorLite.Editor(globalThis.tableApi, {
      fields: [{ inlineEdit: true, label: 'Name', name: 'name', type: 'text' }],
      editing: {
        dialog: { enabled: false },
        inline: { enabled: true, keyboardActivation: [{ key: 'F2' }, { key: 'Enter' }, { key: ' ' }] }
      }
    });
  `,
  });
  const cell = page.locator('#row-a td');
  for (const key of ['F2', 'Enter', 'Space']) {
    await cell.click();
    await page.keyboard.press(key);
    await expect(page.locator('.alteditor-lite-inline')).toHaveCount(1);
    const input = page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Alpha');
    await input.fill('Discarded');
    await page.keyboard.press('Escape');
    await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
    await expect(cell).toHaveText('Alpha');
  }
  expect(errors).toEqual([]);
});

test('activates a KeyTable-focused cell and remaps after ColReorder', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium');
  await createExtensionInlineFixture(page);
  const nameCell = page.locator('#row-a td').first();
  await nameCell.click();
  await page.keyboard.press('F2');
  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toHaveValue('Alpha');
  await nameInput.fill('Discarded');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(nameCell).toContainText('Alpha');

  await page.keyboard.press('Enter');
  await expect(nameInput).toHaveValue('Alpha');
  await nameInput.fill('Saved name');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { exact: true, name: 'Submit' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(nameCell).toContainText('Saved name');
  await page.keyboard.press('Space');
  await expect(nameInput).toHaveValue('Saved name');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);

  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      tableApi?: { colReorder: { move(from: number, to: number): void } };
    };
    runtimeScope.tableApi?.colReorder.move(0, 1);
  });
  const reorderedNameCell = page.locator('#row-a td').nth(1);
  await reorderedNameCell.click();
  await page.keyboard.press('F2');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Saved name');
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('uses one Hybrid editor for committed inline and dialog values', async ({
  page,
}) => {
  await createRenderedControlsFixture(page);
  const renderedStatus = page.getByRole('combobox', { name: 'Rendered status' });
  const renderedSchedule = page.getByLabel('Rendered schedule');
  await expect(renderedStatus).toHaveValue('open');
  await expect(renderedSchedule).toHaveValue('09:00');

  await renderedStatus.dispatchEvent('dblclick');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);

  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.openInlineEdit('#row-a', 'status:name');
  });
  await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Closed' });
  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.submitInlineEdit();
  });

  await expect(renderedStatus).toHaveValue('closed');
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({ schedule: '09:00', status: 'closed' });

  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.openInlineEdit('#row-a', 'schedule:name');
  });
  await page.locator('.alteditor-lite-inline input[type="time"]').fill('10:00');
  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.submitInlineEdit();
  });
  await expect(renderedSchedule).toHaveValue('10:00');

  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.openEditDialog('#row-a');
  });
  const dialog = page.getByRole('dialog', { name: 'Edit row' });
  await dialog
    .getByRole('combobox', { name: 'Status' })
    .selectOption({ label: 'Paused' });
  await dialog.locator('input[type="time"]').fill('10:30');
  await dialog.getByRole('button', { name: 'Submit' }).click();

  await expect(dialog).not.toBeVisible();
  await expect(renderedStatus).toHaveValue('paused');
  await expect(renderedSchedule).toHaveValue('10:30');
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({ schedule: '10:30', status: 'paused' });
});
