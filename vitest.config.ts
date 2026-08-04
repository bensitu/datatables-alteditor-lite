import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    fileParallelism: false,
    isolate: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/datatables/**/*.ts',
        'src/dialog/**/*.ts',
        'src/fields/**/*.ts',
        'src/form/**/*.ts',
        'src/instance/**/*.ts',
        'src/inline/**/*.ts',
        'src/localization/**/*.ts',
        'src/object-path/*.ts',
        'src/search-select/**/*.ts',
      ],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
