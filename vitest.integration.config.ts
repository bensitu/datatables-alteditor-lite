import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    isolate: true,
  },
});
