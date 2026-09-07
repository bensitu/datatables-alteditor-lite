import type { Page } from '@playwright/test';

/** Loads the demo with uncompressed CDN responses and unchanged integrity checks. */
export async function openDemo(page: Page, fragment = ''): Promise<void> {
  await page.route('https://cdn.datatables.net/**', async (route) => {
    const response = await route.fetch({
      headers: { 'accept-encoding': 'identity' },
      // Retry connection resets only, without repeating editor interactions.
      maxRetries: 2,
    });
    await route.fulfill({ response });
  });
  await page.goto(`http://127.0.0.1:4173/examples/demo/${fragment}`);
}
