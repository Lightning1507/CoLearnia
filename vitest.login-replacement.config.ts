import { defineConfig } from 'vitest/config';

// Issue #130: known-failing diagnostic, reported separately from default CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/diagnostics/login-replacement.diagnostic.ts'],
    maxWorkers: 1,
    testTimeout: 25_000,
    hookTimeout: 30_000,
  },
});
