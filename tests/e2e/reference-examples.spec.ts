import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/examples/demo/reference.html');
});

test('edits ordered categories with keyboard, validation, and batch restoration', async ({
  page,
}) => {
  const example = page.locator('#multichoice');
  await example.getByRole('button', { name: 'Create article', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog.locator('[aria-invalid="true"]')).toBeVisible();
  const news = dialog.getByRole('checkbox', { name: 'News', exact: true });
  await news.focus();
  await news.press('Space');
  await dialog.getByRole('checkbox', { name: 'Guides', exact: true }).check();
  await news.uncheck();
  await news.check();
  await expect(dialog.getByRole('status')).toContainText('Guides, News');
  const accessibility = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toContainText('Guides, News');

  await example.getByRole('button', { name: 'Edit both articles' }).click();
  await expect(dialog).toContainText('Multiple values');
  await dialog.getByRole('button', { name: 'Set a common value' }).click();
  await dialog.getByRole('checkbox', { name: 'Research' }).check();
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(dialog).toContainText('Multiple values');
  await dialog.getByRole('button', { name: 'Set a common value' }).click();
  await dialog.getByRole('button', { name: 'Clear choices' }).click();
  await dialog.getByRole('checkbox', { name: 'Research' }).check();
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toContainText(
    'article-1: Research\narticle-2: Research',
  );

  await example.getByRole('button', { name: 'Edit article', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear choices' }).click();
  await expect(news).toBeFocused();
  await expect(dialog.getByRole('checkbox', { name: 'Research' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(example.locator('output')).toContainText('article-1: Research');
  await example.getByRole('button', { name: 'Read-only categories' }).click();
  await news.click();
  await expect(news).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await example.getByRole('button', { name: 'Disabled categories' }).click();
  await expect(news).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(dialog).toBeHidden();
});

test('coordinates parent identity, canonical creation, and independent error recovery', async ({
  page,
}) => {
  const example = page.locator('#parent-child');
  const dialog = page.getByRole('dialog');
  await example.getByRole('button', { name: 'Create order', exact: true }).click();
  await dialog.getByLabel('Order name').fill('New order');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(example.locator('select option:checked')).toHaveText('New order');
  const createdId = await example.locator('select').inputValue();
  await example.getByRole('button', { name: 'Create line' }).click();
  await dialog.getByLabel('Product').fill('Unavailable');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toContainText('This product is unavailable.');
  await expect(example.locator('output')).toHaveText('No order lines.');
  await dialog.getByLabel('Product').fill('Folders');
  await dialog.getByLabel('Quantity').fill('3');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toHaveText('Folders: 3');
  await example.getByRole('button', { name: 'Edit first line' }).click();
  await dialog.getByLabel('Quantity').fill('4');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await example.locator('select').selectOption('order-1');
  await expect(example.locator('output')).toHaveText('Paper: 2');
  await example.locator('select').selectOption(createdId);
  await expect(example.locator('output')).toHaveText('Folders: 4');
  await example.getByRole('button', { name: 'Edit order', exact: true }).click();
  await expect(dialog.getByLabel('Order name')).toHaveValue('New order');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.clock.install();
  await example.getByRole('button', { name: 'Edit first line' }).click();
  await dialog.getByLabel('Product').fill('Discarded product');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.locator('#selected-order').evaluate((element) => {
    if (!(element instanceof HTMLSelectElement))
      throw new Error('Expected order selector.');
    element.value = 'order-1';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.clock.runFor(400);
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toHaveText('Paper: 2');
  await example.locator('select').selectOption(createdId);
  await expect(example.locator('output')).toHaveText('Folders: 4');
});

test('saves multipart files only after success and retains attachments during retry', async ({
  page,
}) => {
  const example = page.locator('#multipart');
  const dialog = page.getByRole('dialog');
  await example.getByRole('button', { name: 'Create document', exact: true }).click();
  await dialog.getByLabel('Document name').fill(' Report ');
  await dialog.getByLabel('Attachment', { exact: true }).setInputFiles({
    name: 'report.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Document contents'),
  });
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(example.locator('output')).toHaveText('No document saved.');
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toHaveText('Report\nAttachment: report.txt');
  await example.getByRole('button', { name: 'Edit document', exact: true }).click();
  await expect(dialog.getByLabel('Attachment', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Document name').fill('Unavailable');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(example.locator('[role="status"]')).toContainText('unavailable');
  await expect(example.locator('output')).toHaveText('Report\nAttachment: report.txt');
  await dialog.getByLabel('Document name').fill('Updated report');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toHaveText(
    'Updated report\nAttachment: report.txt',
  );
  await page.clock.install();
  await example.getByRole('button', { name: 'Edit document', exact: true }).click();
  await dialog.getByLabel('Document name').fill('Discarded document');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.clock.runFor(400);
  await expect(dialog).toBeHidden();
  await expect(example.locator('output')).toHaveText(
    'Updated report\nAttachment: report.txt',
  );
});
