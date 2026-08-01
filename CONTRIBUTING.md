# Contributing

Thank you for helping improve `datatables-alteditor-lite`.

## Development baseline

Use a Node.js version that satisfies:

```text
^20.19.0 || ^22.13.0 || >=24.0.0
```

Install from the committed lockfile and run the core quality gate:

```bash
npm ci
npm run ci:core
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

Every test must remain useful after the change that introduced it. Core unit,
integration, browser, and type tests belong in this repository.

`npm test` enforces two complementary coverage gates. The complete core runtime is
measured across unit and integration tests at 90% statements, 85% branches, 90%
functions, and 90% lines. Safety-critical snapshot, state, object-path, request,
configuration, and normalization modules retain a separate 100% gate.

## Distribution output

Keep `dist/index.js` as readable, non-minified ESM with a source map. Browser
Global core and locale bundles provide readable and `.min.js` variants with source
maps. Do not silently change these stable output roles when adjusting the build.

## Documentation governance

The `docs/` directory is reserved for stable public documentation. Each Markdown
file under `docs/` must begin with:

```yaml
---
audience: public
status: stable
---
```

## Commits and pull requests

Commits must follow the Conventional Commits specification. Pull requests should be
focused, include durable tests for behavior changes, and complete the repository
checklist.
