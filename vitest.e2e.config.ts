import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000, // 60 seconds for E2E tests
    hookTimeout: 60000, // 60 seconds for setup/teardown
    include: ['test/e2e/**/*.test.ts'],
    exclude: ['src/**', 'test/integration/**'],
  },
});