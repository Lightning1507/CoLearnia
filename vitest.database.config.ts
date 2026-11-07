import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/server/test/**/*.integration.ts'],
    fileParallelism: false,
    testTimeout: 25_000,
    hookTimeout: 30_000,
  },
});
