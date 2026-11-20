import { defineConfig } from 'vitest/config';

// SCRUM-94 / issue #130: compatibility command for the default integration regression.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/diagnostics/login-replacement.diagnostic.ts'],
    maxWorkers: 1,
    testTimeout: 25_000,
    hookTimeout: 30_000,
  },
});
