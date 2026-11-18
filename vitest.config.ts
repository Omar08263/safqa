import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/edge/src/**/*.test.ts'],
  },
});
