import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run demo',
    reuseExistingServer: true,
    timeout: 30_000,
    url: 'http://127.0.0.1:4173/examples/demo/',
  },
  workers: 3,
  projects: [
    {
      name: 'chromium',
      testIgnore: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'tablet-webkit',
      testMatch: /editor-inline-touch\.spec\.ts/,
      use: { ...devices['iPad Pro 11'] },
    },
  ],
});
