import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const demoUrl = 'http://127.0.0.1:4173/';

test('runs CRUD, typed SearchSelect, refresh, and public events without jQuery', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(demoUrl);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Native DataTables editing',
  );
  await expect(page.locator('.demo-value-grid article')).toHaveCount(3);
  await expect(page.locator('.demo-contract-card')).toContainText(
    'Mutate DataTables only on success',
  );
  await expect(page.locator('#jquery-status')).toHaveText('not loaded');
  await expect(page.locator('#locale-status')).toHaveText('en, ja, zh-CN, es');
  await expect(page.getByRole('button', { name: 'Create' })).toBeEnabled();

  await page.getByRole('button', { name: 'Create' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Keyboard Employee');
  await dialog.getByLabel('Email').fill('aiko@example.test');
  await dialog.getByLabel('Age').fill('36');
  await dialog.getByLabel('Start date').fill('2026-07-31');
  await dialog.getByLabel('Notes').fill('Created from the public demo.');
  await dialog.getByLabel('Active').check();
  await dialog.getByLabel('Role').selectOption({ label: 'Developer' });

  const officeCombobox = dialog.getByRole('combobox', { name: 'Office' });
  await officeCombobox.focus();
  await page.keyboard.press('Home');
  const firstActiveOption = await officeCombobox.getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  const nextActiveOption = await officeCombobox.getAttribute('aria-activedescendant');
  expect(nextActiveOption).not.toBe(firstActiveOption);
  await page.keyboard.press('ArrowUp');
  await expect(officeCombobox).toHaveAttribute(
    'aria-activedescendant',
    firstActiveOption ?? '',
  );
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(officeCombobox).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(officeCombobox).toHaveValue('Tokyo');
  await page.keyboard.press('Tab');
  await expect(officeCombobox).toHaveAttribute('aria-expanded', 'false');

  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('The same value exists in the currently loaded table data.'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

  await dialog.getByLabel('Email').fill('keyboard@example.test');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog).not.toBeVisible();
  const createdRow = page.locator('#employee-4');
  await expect(createdRow).toContainText('Keyboard Employee');
  await expect(createdRow).toContainText('Tokyo');

  await createdRow.click();
  await page.getByRole('button', { name: 'Fail the next persistence request' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Edited Employee');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('The requested demo failure occurred.');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(createdRow).toContainText('Edited Employee');

  await page.getByRole('button', { name: 'Remove' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Confirm');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(createdRow).toHaveCount(0);

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('#editor-state')).toHaveText('ready');
  await page.getByRole('button', { name: 'Initialize a second table' }).click();
  await expect(page.locator('#secondary-host')).toBeVisible();
  await expect(page.locator('#secondary-employees')).toContainText('Independent row');
  await expect(page.locator('#event-log li').first()).toContainText('bubbles=false');
  await expect(
    page
      .locator('script[src]')
      .evaluateAll((scripts) =>
        scripts.every((script) => !(script.getAttribute('src') ?? '').includes('/src/')),
      ),
  ).resolves.toBe(true);
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('switches all locales by destroy and recreate and protects IME Enter', async ({
  page,
}) => {
  await page.goto(demoUrl);

  const localeCases = [
    { cancel: 'キャンセル', title: '行を作成', value: 'ja' },
    { cancel: '取消', title: '新建行', value: 'zh-CN' },
    { cancel: 'Cancelar', title: 'Crear fila', value: 'es' },
    { cancel: 'Cancel', title: 'Create row', value: 'en' },
  ] as const;

  for (const localeCase of localeCases) {
    await page.locator('#locale-select').selectOption(localeCase.value);
    await page.getByRole('button', { name: /Create|作成|新建|Crear/u }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText(localeCase.title);

    if (localeCase.value === 'ja' || localeCase.value === 'zh-CN') {
      const officeCombobox = dialog.getByRole('combobox', { name: /Office/u });
      await officeCombobox.focus();
      await officeCombobox.dispatchEvent('compositionstart');
      const isEnterPrevented = await officeCombobox.evaluate((inputElement) => {
        const enterEvent = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
        });
        inputElement.dispatchEvent(enterEvent);
        return enterEvent.defaultPrevented;
      });
      expect(isEnterPrevented).toBe(true);
      await expect(dialog).toBeVisible();
      await officeCombobox.dispatchEvent('compositionend');
    }

    await dialog.getByRole('button', { name: localeCase.cancel }).click();
    await expect(dialog).not.toBeVisible();
  }
});

test('meets CSP, accessibility, reduced-motion, and narrow high-zoom smoke gates', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const response = await page.goto(demoUrl);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response?.headers()['content-security-policy']).toContain(
    'https://cdn.datatables.net',
  );
  await expect(page.locator('script[src*="dt-3.0.1"][src*="b-4.0.1"]')).toHaveCount(1);
  await expect(
    page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).resolves.toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
  const accessibilityScan = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    accessibilityScan.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Create' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Office' }).focus();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.evaluate(
      (dialogElement) => dialogElement.scrollWidth <= dialogElement.clientWidth,
    ),
  ).resolves.toBe(true);
  const dialogAccessibilityScan = await new AxeBuilder({ page })
    .include('.dt-alteditor-lite-dialog')
    .analyze();
  expect(
    dialogAccessibilityScan.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);
});
