import { defineConfig } from 'vitest/config';

// Component tests for the web UI. Playwright end-to-end tests live in e2e/.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    // Some tests re-import modules after vi.resetModules(); the first cold import can be slow.
    testTimeout: 20000,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
