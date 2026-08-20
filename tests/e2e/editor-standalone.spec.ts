import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('runs Standalone CRUD, recovery, validation, and keyboard focus', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4173/examples/demo/#standalone-example');

  const standaloneExample = page.locator('#standalone-example');
  await expect(standaloneExample.locator('table')).toHaveCount(0);
  const createButton = standaloneExample.getByRole('button', { name: 'Create' });
  await createButton.focus();
  await createButton.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(
    accessibility.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);

  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toBeFocused();

  await dialog.getByLabel('Name').fill('Example record');
  await dialog.getByLabel('Email').fill('record@example.test');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await expect(standaloneExample.locator('#record-name')).toHaveText('Example record');
  await expect(createButton).toBeFocused();

  await standaloneExample.getByRole('button', { name: 'Edit' }).click();
  await dialog.getByLabel('Name').fill('Unavailable');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeVisible();
  await expect(standaloneExample.getByRole('status')).toHaveText(
    'Choose a different name and try again.',
  );
  await expect(standaloneExample.locator('#record-name')).toHaveText('Example record');

  await dialog.getByLabel('Name').fill('Updated record');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await expect(standaloneExample.locator('#record-name')).toHaveText('Updated record');

  await standaloneExample.getByRole('button', { name: 'Remove' }).click();
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog).toBeHidden();
  await expect(standaloneExample.locator('#empty-record')).toBeVisible();

  await createButton.focus();
  await createButton.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(createButton).toBeFocused();
});
