import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/editor-state-transition.ts',
        'src/datatables/assert-data-table-global.ts',
        'src/object-path/*.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
