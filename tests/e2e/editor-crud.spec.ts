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
const browserBundlePath = resolve(repositoryRoot, 'dist/datatables-alteditor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/alt-editor-lite.css');

async function createCrudFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite CRUD browser test</title></head>
      <body>
        <main>
          <button id="edit-explicit" type="button">Edit Alpha</button>
          <button id="remove-explicit" type="button">Remove Beta</button>
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
      globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
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
                throw new DataTablesAltEditorLite.AltEditorLiteError({
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
      globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
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

  const dialog = page.locator('dialog');
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

test('always confirms Remove and restores focus after keyboard activation', async ({
  page,
}) => {
  await createCrudFixture(page);
  const removeButton = page.locator('#remove-explicit');
  await removeButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.locator('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dt-alteditor-lite-form')).toHaveCount(0);
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

test('has no serious or critical axe violations in Edit and Remove dialogs', async ({
  page,
}) => {
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
