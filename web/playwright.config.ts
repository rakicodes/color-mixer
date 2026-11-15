import { defineConfig, devices } from '@playwright/test';

const PORT = 5174; // not the dev server's 5173, so tests never reuse a server that reports to Sentry

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries absorb rare browser flakiness in CI; a real failure still fails 3 times and blocks the deploy.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // Overrides web/.env: error reporting is off during tests (checked in persistence.spec.ts).
    env: { VITE_SENTRY_DSN: '' },
  },
});
