# Contributing

Thank you for helping improve `datatables-alteditor-lite`.

## Development setup

Use a Node.js version supported by `package.json`, install from the committed
lockfile, and run the repository checks:

```bash
npm ci
npm run check
```

Do not use `--force` or `--legacy-peer-deps`.

## Source conventions

- Use public DataTables APIs only.
- Keep runtime code independent of jQuery and third-party UI libraries.
- Keep Buttons and Select integrations optional.
- Use `camelCase` for variables, properties, functions, and methods.
- Use `PascalCase` for classes, interfaces, and types.
- Use `UPPER_SNAKE_CASE` only for true global constants.
- Use `kebab-case` for file and directory names.
- Write all comments and TSDoc in English.
- Add TSDoc to exported APIs and explain intent, invariants, lifecycle, ownership,
  cancellation, ordering, rollback, security boundaries, or platform constraints.
- Do not use comments to restate code or preserve implementation history.
- Avoid ambiguous names such as `manager`, `helper`, `utils`, `common`, and `misc`.

## Tests

Every test must remain useful after the change that introduced it. Unit,
integration, browser, and public type tests should verify library behavior rather
than third-party implementation details, documentation text, build configuration,
or the test suite itself. Coverage is measured across the runtime source with
repository-wide thresholds defined in `vitest.config.ts`.

## Distribution output

Keep `dist/index.js` as readable, non-minified ESM with a source map. Browser
Global and language bundles provide readable and `.min.js` variants with source
maps. Copy JSON language resources unchanged so they can be loaded directly by
browsers and applications.

## Commits and pull requests

Commits must follow the Conventional Commits specification. Pull requests should be
focused, include durable tests for behavior changes, and complete the repository
checklist.
