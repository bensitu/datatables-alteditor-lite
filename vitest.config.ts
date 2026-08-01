import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/editor-snapshot.ts',
        'src/core/editor-state-transition.ts',
        'src/core/error-normalization.ts',
        'src/core/merge-declared-field-values.ts',
        'src/core/request-sequence.ts',
        'src/core/validate-operation-configuration.ts',
        'src/datatables/assert-data-table-global.ts',
        'src/datatables/row-target-resolution.ts',
        'src/object-path/*.ts',
        'src/search-select/filter-search-options.ts',
        'src/search-select/search-select-keyboard.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage/critical',
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
