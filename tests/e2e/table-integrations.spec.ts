import { expect, test } from '@playwright/test';

import { openDemo } from './demo-navigation.js';

test('AG Grid keeps an edited selection attached to its record after sorting', async ({
  page,
}) => {
  await openDemo(page, 'tables/ag-grid.html');
  await page.getByRole('gridcell', { name: 'North', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selection' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Region').fill('York');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: 'York' })).toHaveAttribute(
    'aria-rowindex',
    '4',
  );
  await page.getByRole('button', { name: 'Edit selection' }).click();
  await expect(dialog.getByLabel('Region')).toHaveValue('York');
});

test('Bootstrap Table applies a saved record on a different page', async ({ page }) => {
  await openDemo(page, 'tables/bootstrap-table.html');
  await page.getByLabel('Region', { exact: true }).selectOption('west');
  await page.getByRole('button', { name: 'Edit region' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Units').fill('75');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'to page 2', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'West' })).toContainText('75');
});

test('Plotly updates the table total and chart after a successful retry', async ({
  page,
}) => {
  await openDemo(page, 'tables/plotly.html');
  await page.getByLabel('Simulate a failure on the next save').check();
  await page.getByRole('button', { name: 'Edit region' }).press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Units').fill('46');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toContainText('Try saving again.');
  await expect(page.locator('output')).toContainText('North: 24');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#sales')).toContainText('100');
  const chart = await page
    .locator('#sales')
    .evaluate(
      (element) =>
        (element as HTMLElement & { data: { type: string; y?: number[] }[] }).data.find(
          (trace) => trace.type === 'bar',
        )?.y,
    );
  expect(chart).toEqual([46, 36, 18]);
});

test('VTable opens the saved record from a sorted data cell', async ({ page }) => {
  await openDemo(page, 'tables/vtable.html');
  await page.getByLabel('Region', { exact: true }).selectOption('south');
  await page.getByRole('button', { name: 'Edit region' }).press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Units').fill('12');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  const canvas = page.locator('#sales canvas').first();
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error('The sales table is not visible.');
  const x = Math.round(bounds.width * 0.75);
  await canvas.dblclick({ position: { x, y: 60 } });
  await expect(dialog.getByLabel('Region')).toHaveValue('South');
  await expect(dialog.getByLabel('Units')).toHaveValue('12');
});
