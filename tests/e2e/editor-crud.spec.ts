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
const buttonsScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-buttons/js/dataTables.buttons.js',
);
const selectScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-select/js/dataTables.select.js',
);
const browserBundlePath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');

interface DynamicFormRuntime {
  readonly persistenceCalls?: number;
  readonly tableApi?: {
    row(selector: string): {
      data(): {
        readonly contractEnd: string;
        readonly country: string;
        readonly prefecture: string;
        readonly startDate: string;
      };
    };
  };
}

async function createCrudFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite CRUD browser test</title></head>
      <body>
        <main>
          <button id="edit-explicit" type="button">Edit Alpha</button>
          <button id="remove-explicit" type="button">Remove Beta</button>
          <button id="refresh-explicit" type="button">Refresh records</button>
          <table id="editor-table">
            <thead>
              <tr><th>Name</th><th>Rank</th></tr>
            </thead>
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
      globalThis.updateCalls = 0;
      globalThis.removeCalls = 0;
      globalThis.refreshCalls = 0;
      globalThis.holdNextUpdate = false;
      globalThis.releaseRemove = undefined;
      globalThis.releaseUpdate = undefined;
      globalThis.shouldFailUpdate = false;
      globalThis.tableApi = new DataTable('#editor-table', {
        columns: [{ data: 'name' }, { data: 'rank' }],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1 },
          { id: 'row-b', name: 'Beta', rank: 2 },
          { id: 'row-c', name: 'Gamma', rank: 3 }
        ],
        order: [[1, 'asc']],
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          fields: [
            {
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              label: 'Rank',
              name: 'rank',
              required: true,
              type: 'number'
            }
          ],
          operations: {
            create: async values => ({
              id: 'created',
              name: values.name ?? '',
              rank: values.rank ?? 0
            }),
            update: async (values, original) => {
              globalThis.updateCalls += 1;
              if (globalThis.holdNextUpdate) {
                globalThis.holdNextUpdate = false;
                await new Promise(resolve => {
                  globalThis.releaseUpdate = resolve;
                });
                globalThis.releaseUpdate = undefined;
              } else {
                await new Promise(resolve => {
                  globalThis.setTimeout(resolve, 120);
                });
              }
              if (globalThis.shouldFailUpdate) {
                globalThis.shouldFailUpdate = false;
                throw new AltEditorLite.AltEditorLiteError({
                  code: 'TEMPORARY_UPDATE',
                  message: 'Retry update.',
                  retryable: true
                });
              }
              return {
                ...original,
                name: values.name ?? original.name,
                rank: values.rank ?? original.rank
              };
            },
            remove: async () => {
              globalThis.removeCalls += 1;
              await new Promise(resolve => {
                globalThis.releaseRemove = resolve;
              });
              globalThis.releaseRemove = undefined;
            },
            refresh: () => {
              globalThis.refreshCalls += 1;
              globalThis.tableApi
                .row('#row-a')
                .data({ id: 'row-a', name: 'Refreshed Alpha', rank: 4 })
                .draw(false);
            }
          }
        }
      );
      document.querySelector('#edit-explicit').addEventListener('click', () => {
        void globalThis.editor.openEditDialog('#row-a');
      });
      document.querySelector('#remove-explicit').addEventListener('click', () => {
        void globalThis.editor.openRemoveDialog('#row-b');
      });
      document.querySelector('#refresh-explicit').addEventListener('click', () => {
        void globalThis.editor.refresh();
      });
    `,
  });
}

async function createDynamicFormFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite dynamic form browser test</title></head>
      <body>
        <main>
          <button id="edit-schedule" type="button">Edit schedule</button>
          <template id="schedule-layout">
            <section class="schedule-layout">
              <fieldset>
                <legend>Location</legend>
                <div data-alteditor-lite-field="country"></div>
                <div data-alteditor-lite-field="prefecture"></div>
              </fieldset>
              <fieldset>
                <legend>Schedule</legend>
                <div data-alteditor-lite-field="startDate"></div>
                <div data-alteditor-lite-field="contractEnd"></div>
              </fieldset>
            </section>
          </template>
          <table id="schedule-table">
            <thead>
              <tr><th>Country</th><th>Prefecture</th><th>Start</th><th>End</th></tr>
            </thead>
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
      globalThis.persistenceCalls = 0;
      globalThis.tableApi = new DataTable('#schedule-table', {
        columns: [
          { data: 'country' },
          { data: 'prefecture' },
          { data: 'startDate' },
          { data: 'contractEnd' }
        ],
        data: [{
          contractEnd: '2026-09-01',
          country: 'US',
          id: 'row-a',
          prefecture: '',
          startDate: '2026-08-01'
        }],
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          dependencies: {
            country: async (country, { signal, values }) => {
              await new Promise((resolve, reject) => {
                const timer = globalThis.setTimeout(resolve, 20);
                signal.addEventListener('abort', () => {
                  globalThis.clearTimeout(timer);
                  reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
              });
              const options = country === 'JP'
                ? [
                    { label: 'Tokyo', value: 'tokyo' },
                    { label: 'Osaka', value: 'osaka' }
                  ]
                : [];
              const currentValue = options.some(option => option.value === values.prefecture)
                ? values.prefecture
                : options[0]?.value;
              return {
                prefecture: {
                  options,
                  required: country === 'JP',
                  value: currentValue,
                  visible: country === 'JP'
                }
              };
            }
          },
          editing: {
            dialog: { template: '#schedule-layout' }
          },
          fields: [
            {
              label: 'Country',
              name: 'country',
              options: [
                { label: 'United States', value: 'US' },
                { label: 'Japan', value: 'JP' }
              ],
              required: true,
              type: 'select'
            },
            {
              label: 'Prefecture',
              name: 'prefecture',
              options: [{ label: 'Not applicable', value: '' }],
              type: 'select',
              visible: false
            },
            {
              label: 'Start date',
              name: 'startDate',
              required: true,
              type: 'date'
            },
            {
              label: 'Contract end',
              name: 'contractEnd',
              required: true,
              type: 'date'
            }
          ],
          operations: {
            async update(values, original) {
              globalThis.persistenceCalls += 1;
              return {
                ...original,
                contractEnd: values.contractEnd ?? original.contractEnd,
                country: values.country ?? original.country,
                prefecture: values.prefecture ?? original.prefecture,
                startDate: values.startDate ?? original.startDate
              };
            }
          },
          validateForm(values) {
            return values.contractEnd !== undefined &&
              values.startDate !== undefined &&
              values.contractEnd < values.startDate
              ? {
                  fieldErrors: {
                    contractEnd: 'Contract end must not precede the start date.'
                  },
                  message: 'Review the schedule.',
                  valid: false
                }
              : { valid: true };
          }
        }
      );
      document.querySelector('#edit-schedule').addEventListener('click', () => {
        void globalThis.editor.openEditDialog('#row-a');
      });
    `,
  });
}

async function createExtensionsFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite extensions browser test</title></head>
      <body>
        <main>
          <table id="extensions-table">
            <thead>
              <tr><th>Name</th><th>Rank</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: buttonsScriptPath });
  await page.addScriptTag({ path: selectScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#extensions-table', {
        columns: [{ data: 'name' }, { data: 'rank' }],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1 },
          { id: 'row-b', name: 'Beta', rank: 2 },
          { id: 'row-c', name: 'Gamma', rank: 3 }
        ],
        layout: {
          topStart: {
            buttons: [
              'altEditorLiteCreate',
              'altEditorLiteEdit',
              'altEditorLiteRemove',
              'altEditorLiteRefresh'
            ]
          }
        },
        rowId: 'id',
        select: true
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          clientSide: {
            createRow(values) {
              return {
                id: 'button-created',
                name: values.name ?? '',
                rank: values.rank ?? 0
              };
            }
          },
          fields: [
            {
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              label: 'Rank',
              name: 'rank',
              required: true,
              type: 'number'
            }
          ]
        }
      );
    `,
  });
}

async function replaceFocusedInput(page: Page, value: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(value);
}

test('edits an explicit snapshot with keyboard only after redraw', async ({ page }) => {
  await createCrudFixture(page);
  const editButton = page.locator('#edit-explicit');
  await editButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Edit row' });
  const nameInput = dialog.getByRole('textbox', { exact: true, name: 'Name' });
  await expect(dialog).toBeVisible();
  await expect(nameInput).toBeFocused();
  await replaceFocusedInput(page, 'Keyboard Alpha');
  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      tableApi?: {
        draw(): unknown;
        order(order: readonly (readonly [number, string])[]): {
          draw(): unknown;
        };
      };
    };
    runtimeScope.tableApi?.order([[1, 'desc']]).draw();
  });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(dialog).not.toBeVisible();
  await expect(editButton).toBeFocused();
  await expect(page.locator('#row-a')).toContainText('Keyboard Alpha');
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('refreshes visible records from an application control', async ({ page }) => {
  await createCrudFixture(page);

  await page.getByRole('button', { name: 'Refresh records' }).click();

  await expect(page.locator('#row-a')).toContainText('Refreshed Alpha');
  await expect(
    page.evaluate(
      () => (globalThis as typeof globalThis & { refreshCalls?: number }).refreshCalls,
    ),
  ).resolves.toBe(1);
});

test('uses a custom dynamic form and corrects cross-field validation', async ({
  page,
}) => {
  await createDynamicFormFixture(page);
  const openButton = page.getByRole('button', { name: 'Edit schedule' });
  await openButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Edit row' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Location' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Schedule' })).toBeVisible();
  const scan = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(
    scan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  const prefecture = dialog.getByRole('combobox', { name: 'Prefecture' });
  await expect(prefecture).toBeHidden();
  await dialog
    .getByRole('combobox', { name: 'Country' })
    .selectOption({ label: 'Japan' });
  await expect(prefecture).toBeVisible();
  await expect(prefecture.locator('option')).toHaveText(['Tokyo', 'Osaka']);
  await prefecture.selectOption({ label: 'Osaka' });

  await dialog.getByLabel('Start date').fill('2026-09-10');
  await dialog.getByLabel('Contract end').fill('2026-09-01');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Review the schedule.')).toBeVisible();
  await expect(
    dialog.getByText('Contract end must not precede the start date.'),
  ).toBeVisible();
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & DynamicFormRuntime;
      return runtimeScope.persistenceCalls;
    }),
  ).resolves.toBe(0);
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & DynamicFormRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({ country: 'US', prefecture: '' });

  await dialog.getByLabel('Contract end').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(openButton).toBeFocused();
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & DynamicFormRuntime;
      return runtimeScope.persistenceCalls;
    }),
  ).resolves.toBe(1);
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & DynamicFormRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({
    contractEnd: '2026-10-01',
    country: 'JP',
    prefecture: 'osaka',
    startDate: '2026-09-10',
  });
});

test('always confirms Remove and restores focus after keyboard activation', async ({
  page,
}) => {
  await createCrudFixture(page);
  const removeButton = page.locator('#remove-explicit');
  await removeButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.locator('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.alteditor-lite-form')).toHaveCount(0);
  await expect(dialog).toContainText('Selected rows: 1.');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { exact: true, name: 'Remove' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      releaseRemove?: () => void;
    };
    runtimeScope.releaseRemove?.();
  });
  await expect(dialog).not.toBeVisible();
  await expect(removeButton).toBeFocused();
  await expect(page.locator('#row-b')).toHaveCount(0);
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & {
        removeCalls?: unknown;
      };
      return runtimeScope.removeCalls;
    }),
  ).resolves.toBe(1);
});

test('blocks duplicate async submission and supports an explicit retry', async ({
  page,
}) => {
  await createCrudFixture(page);
  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      holdNextUpdate?: boolean;
      shouldFailUpdate?: boolean;
    };
    runtimeScope.holdNextUpdate = true;
    runtimeScope.shouldFailUpdate = true;
  });
  await page.locator('#edit-explicit').click();
  const dialog = page.locator('dialog');
  const nameInput = dialog.getByRole('textbox', { exact: true, name: 'Name' });
  await nameInput.fill('Retry Alpha');
  await dialog.locator('form').evaluate((formElement) => {
    if (!(formElement instanceof HTMLFormElement)) {
      throw new Error('Expected an editor form.');
    }
    formElement.requestSubmit();
    formElement.requestSubmit();
  });

  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const runtimeScope = globalThis as typeof globalThis & {
          updateCalls?: unknown;
        };
        return runtimeScope.updateCalls;
      });
    })
    .toBe(1);
  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      releaseUpdate?: () => void;
    };
    if (typeof runtimeScope.releaseUpdate !== 'function') {
      throw new Error('Expected a pending Update resolver.');
    }
    runtimeScope.releaseUpdate();
  });
  await expect(dialog).toContainText('Retry update.');
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & {
        updateCalls?: unknown;
      };
      return runtimeScope.updateCalls;
    }),
  ).resolves.toBe(1);
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & {
        updateCalls?: unknown;
      };
      return runtimeScope.updateCalls;
    }),
  ).resolves.toBe(2);
  await expect(page.locator('#row-a')).toContainText('Retry Alpha');
});

test('integrates Buttons and Select while preserving the opening target', async ({
  page,
}) => {
  await createExtensionsFixture(page);
  const createButton = page.getByRole('button', { name: 'Create' });
  const editButton = page.getByRole('button', { name: 'Edit' });
  const removeButton = page.getByRole('button', { name: 'Remove' });
  const refreshButton = page.getByRole('button', { name: 'Refresh' });

  await expect(createButton).toBeEnabled();
  await expect(refreshButton).toBeEnabled();
  await expect(editButton).toBeDisabled();
  await expect(editButton).toHaveAttribute('aria-disabled', 'true');
  await expect(removeButton).toBeDisabled();

  await page.locator('#row-a').click();
  await expect(editButton).toBeEnabled();
  await expect(removeButton).toBeEnabled();
  await editButton.click();
  await page.getByRole('textbox', { exact: true, name: 'Name' }).fill('Selected Alpha');
  await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      tableApi?: {
        draw(): unknown;
        order(order: readonly (readonly [number, string])[]): {
          draw(): unknown;
        };
        row(rowIndex: number): {
          deselect(): unknown;
          select(): unknown;
        };
      };
    };
    runtimeScope.tableApi?.row(0).deselect();
    runtimeScope.tableApi?.row(1).select();
    runtimeScope.tableApi?.order([[1, 'desc']]).draw();
  });
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.locator('#row-a')).toContainText('Selected Alpha');
  await expect(page.locator('#row-b')).toContainText('Beta');
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('keeps Hybrid Dialog Edit available while changing employee selection', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4173/examples/demo/');
  const employeeDirectory = page.getByRole('region', {
    exact: true,
    name: 'Employee directory',
  });
  const editButton = employeeDirectory.getByRole('button', {
    exact: true,
    name: 'Edit',
  });
  const selectionStatus = employeeDirectory.locator('#hybrid-selection-status');
  const aikoRow = employeeDirectory.getByRole('row', { name: /Aiko Tanaka/ });
  const janeRow = employeeDirectory.getByRole('row', { name: /Jane Smith/ });

  await expect(janeRow).toBeVisible({ timeout: 10_000 });
  await expect(selectionStatus).toContainText(
    'Select one employee for single-row editing or several employees to apply common values.',
  );
  await aikoRow.click();
  await expect(selectionStatus).toContainText(
    'Single-row editing is ready for Aiko Tanaka.',
  );

  await janeRow.click();
  await expect(employeeDirectory.locator('tbody tr.selected')).toHaveCount(2);
  await expect(selectionStatus).toContainText(
    'Multi-row editing is ready for 2 employees.',
  );
  await aikoRow.click();
  await expect(employeeDirectory.locator('tbody tr.selected')).toHaveCount(1);
  await expect(janeRow).toHaveClass(/selected/);
  await expect(selectionStatus).toContainText(
    'Single-row editing is ready for Jane Smith.',
  );
  await expect(editButton).toBeEnabled();
  await editButton.click();

  const dialog = page.getByRole('dialog', { name: 'Edit row' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { exact: true, name: 'Name' })).toHaveValue(
    'Jane Smith',
  );
  await expect(dialog.getByRole('combobox', { name: 'Prefecture' })).toBeHidden();

  const activeControl = dialog.getByRole('checkbox', { name: 'Active' });
  const activeRow = activeControl.locator('..');
  const activeLabel = activeRow.locator('.alteditor-lite-field__label');
  const [activeBox, activeLabelBox, activeRowBox] = await Promise.all([
    activeControl.boundingBox(),
    activeLabel.boundingBox(),
    activeRow.boundingBox(),
  ]);
  expect(activeBox).not.toBeNull();
  expect(activeLabelBox).not.toBeNull();
  expect(activeRowBox).not.toBeNull();
  expect(
    (activeBox?.y ?? 0) - ((activeLabelBox?.y ?? 0) + (activeLabelBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(8);
  expect(activeRowBox?.height ?? 0).toBeGreaterThanOrEqual(64);
});

test('applies a common value through desktop multi-row editing', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/examples/demo/');
  const employeeDirectory = page.getByRole('region', {
    exact: true,
    name: 'Employee directory',
  });
  const aikoRow = employeeDirectory.getByRole('row', { name: /Aiko Tanaka/ });
  const janeRow = employeeDirectory.getByRole('row', { name: /Jane Smith/ });

  await aikoRow.click();
  await janeRow.click();
  await employeeDirectory.getByRole('button', { exact: true, name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit multiple rows' });
  const nameField = dialog.locator('[data-alteditor-lite-batch-field="name"]');
  await expect(nameField).toContainText('Multiple values');
  await nameField.getByRole('button', { name: 'Set a common value' }).click();
  await dialog
    .getByRole('textbox', { exact: true, name: 'Name' })
    .fill('Shared team member');
  await dialog.getByRole('button', { name: 'Submit' }).click();

  await expect(dialog).toBeHidden();
  await expect(employeeDirectory.locator('#employee-1')).toContainText(
    'Shared team member',
  );
  await expect(employeeDirectory.locator('#employee-5')).toContainText(
    'Shared team member',
  );
});

test('has no serious or critical axe violations in dark Edit and Remove dialogs', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await createCrudFixture(page);
  await page.locator('#edit-explicit').click();
  const editScan = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(
    editScan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.locator('#remove-explicit').click();
  const removeScan = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(
    removeScan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
});
