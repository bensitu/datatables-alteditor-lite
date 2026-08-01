import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import tsdoc from 'eslint-plugin-tsdoc';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

const restrictedIdentifiers = [
  'common',
  'helper',
  'helpers',
  'manager',
  'misc',
  'obj',
  'processData',
  'handleData',
  'temp',
  'utils',
];

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.work/**',
      'artifacts/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tmp/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [
      ...typescriptEslint.configs.strictTypeChecked,
      ...typescriptEslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'eslint-comments': eslintComments,
      'import-x': importX,
      tsdoc,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          disallowTypeAnnotations: false,
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'property',
          filter: {
            regex: '^DataTable$',
            match: true,
          },
          format: null,
        },
        {
          selector: ['objectLiteralMethod', 'typeMethod'],
          filter: {
            regex: '^DataTable$',
            match: true,
          },
          format: null,
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'should', 'can', 'did', 'will'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: ['function', 'method', 'accessor'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: false,
          allowNullableBoolean: false,
          allowNullableEnum: false,
          allowNullableNumber: false,
          allowNullableObject: false,
          allowNullableString: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'eslint-comments/disable-enable-pair': [
        'error',
        {
          allowWholeFile: false,
        },
      ],
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/require-description': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...restrictedIdentifiers.map((identifier) => ({
          selector: `Identifier[name="${identifier}"]`,
          message: `Use a domain-specific name instead of "${identifier}".`,
        })),
      ],
      'no-warning-comments': [
        'error',
        {
          location: 'anywhere',
          terms: ['fixme', 'todo'],
        },
      ],
      'tsdoc/syntax': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['*.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['examples/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        DataTable: 'readonly',
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    plugins: {
      'eslint-comments': eslintComments,
      'import-x': importX,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'eslint-comments/disable-enable-pair': [
        'error',
        {
          allowWholeFile: false,
        },
      ],
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/require-description': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...restrictedIdentifiers.map((identifier) => ({
          selector: `Identifier[name="${identifier}"]`,
          message: `Use a domain-specific name instead of "${identifier}".`,
        })),
      ],
      'no-warning-comments': [
        'error',
        {
          location: 'anywhere',
          terms: ['fixme', 'todo'],
        },
      ],
    },
  },
);
