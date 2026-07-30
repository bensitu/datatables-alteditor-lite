# datatables-alteditor-lite

`datatables-alteditor-lite` is an independent, lightweight editing extension being
built for DataTables 3.x. It is designed for TypeScript, native browser APIs, and a
runtime without jQuery or third-party UI frameworks.

The package is not yet published and its editor functionality is not yet available.
The current repository contains the reproducible development baseline and permanent
DataTables public-contract tests.

## Development

Use a supported Node.js version and install the exact dependency graph:

```bash
npm ci
```

Common commands:

```bash
npm run format:check
npm run lint
npm run lint:styles
npm run typecheck
npm run test
npm run test:integration
npm run build
npm run test:types
npm run test:e2e
npm run ci:core
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions and documentation
governance.
