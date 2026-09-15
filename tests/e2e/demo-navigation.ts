import type { Page, Route } from '@playwright/test';

interface CdnResource {
  readonly body: Buffer;
  readonly headers: Record<string, string>;
  readonly status: number;
}

const cdnResources = new Map<string, CdnResource>();

async function readCdnResource(route: Route): Promise<CdnResource> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await route.fetch({
        headers: { 'accept-encoding': 'identity' },
        maxRetries: 0,
      });
      try {
        const headers = response.headers();
        delete headers['content-length'];
        delete headers['transfer-encoding'];
        return { body: await response.body(), headers, status: response.status() };
      } finally {
        await response.dispose();
      }
    } catch (error: unknown) {
      if (
        attempt >= 2 ||
        !(error instanceof Error) ||
        !/aborted|ECONNRESET/u.test(error.message)
      ) {
        throw error;
      }
    }
  }
}

/** Reuses versioned CDN resources without changing content or integrity checks. */
export async function openDemo(page: Page, fragment = ''): Promise<void> {
  await page.route('https://cdn.datatables.net/**', async (route) => {
    const url = route.request().url();
    let resource = cdnResources.get(url);
    if (resource === undefined) {
      resource = await readCdnResource(route);
      if (resource.status === 200) cdnResources.set(url, resource);
    }
    await route.fulfill(resource);
  });
  await page.goto(`http://127.0.0.1:4173/examples/demo/${fragment}`);
}
