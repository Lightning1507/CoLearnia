import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/server/test/**/*.integration.ts', 'test/**/*.integration.mjs'],
    fileParallelism: false,
    testTimeout: 25_000,
    hookTimeout: 30_000,
  },
});
