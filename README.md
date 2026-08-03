# datatables-alteditor-lite

`datatables-alteditor-lite` is an independent, lightweight editing extension for
DataTables 3. It provides Create, Edit, Remove, and Refresh workflows using
TypeScript, native browser controls, and the public DataTables API. It has no
jQuery or UI-framework runtime dependency.

[Live demo](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/) ·
[Getting started](docs/getting-started.md) ·
[Configuration](docs/configuration.md) · [Fields](docs/fields.md) ·
[Operations](docs/operations.md) · [API reference](docs/api-reference.md) ·
[Localization](docs/localization.md)

## Highlights

- Native `<dialog>` forms with focus containment, restoration, responsive layout,
  and accessible validation feedback
- Create, Edit, Remove, and Ajax-aware or local Refresh operations
- Non-optimistic asynchronous persistence with `AbortSignal`
- Stable Edit and Remove target snapshots that fail closed when row identity
  changes
- Text, email, password, number, date, time, datetime-local, textarea, checkbox,
  radio, select, local SearchSelect, file, and hidden fields
- Typed option identity, safe nested field paths, custom validation, and optional
  local uniqueness checks
- Optional DataTables Buttons and Select integration
- External JSON languages, inline overrides, and included English, Japanese,
  Simplified Chinese, and Spanish resources
- ESM and Browser Global distributions with responsive light and dark CSS

## Installation

Install the core packages:

```bash
npm install datatables.net datatables-alteditor-lite
```

Install Buttons and Select when the registered editor buttons and selection-based
targeting are needed:

```bash
npm install datatables.net-buttons datatables.net-select
```

The package peer ranges accept compatible DataTables 3, Buttons 4, and Select 4
releases rather than one fixed patch version.

## Quick start

Import optional extensions before AltEditorLite so their integrations are
available during registration:

```ts
import DataTable from 'datatables.net';
import 'datatables.net-buttons';
import 'datatables.net-select';
import { AltEditorLite, type EditorValues } from 'datatables-alteditor-lite';
import 'datatables-alteditor-lite/style.css';

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
}

interface UserForm {
  readonly name: string;
  readonly rank: number;
}

const table = new DataTable<UserRow>('#users', {
  columns: [{ data: 'name' }, { data: 'rank' }],
  data: [],
  layout: {
    topStart: {
      buttons: [
        'altEditorLiteCreate',
        'altEditorLiteEdit',
        'altEditorLiteRemove',
        'altEditorLiteRefresh',
      ],
    },
  },
  rowId: 'id',
  select: { style: 'multi' },
});

const editor = new AltEditorLite<UserRow, UserForm>(table, {
  clientSide: {
    createRow(values: Readonly<EditorValues<UserForm>>): UserRow {
      return {
        id: crypto.randomUUID(),
        name: values.name ?? '',
        rank: values.rank ?? 1,
      };
    },
  },
  fields: [
    { label: 'Name', name: 'name', required: true, type: 'text' },
    {
      attributes: { min: '1' },
      label: 'Rank',
      name: 'rank',
      required: true,
      type: 'number',
    },
  ],
});
```

Create requires either `clientSide.createRow` or `operations.create`. Edit safely
merges declared fields by default, and Remove operates locally unless a persistence
callback is supplied.

Use explicit DataTables row selectors when Select is not installed:

```ts
await editor.openEditDialog('#user-42');
await editor.openRemoveDialog(['#user-42', '#user-43']);
```

The registered API method only retrieves an existing instance:

```ts
table.altEditorLite<UserForm>(); // AltEditorLite<UserRow, UserForm> | null
```

Call `editor.destroy()` before replacing the table or creating another editor for
the same table element.

## Persistence operations

Remote callbacks receive the complete operation context and may be synchronous or
asynchronous. DataTables is changed only after a callback succeeds.

```ts
const editor = new AltEditorLite<UserRow, UserForm>(table, {
  fields,
  operations: {
    async create(values, context) {
      return await createUser(values, context.signal);
    },
    async update(values, original, context) {
      return await updateUser(original.id, values, context.signal);
    },
    async remove(rows, context) {
      await removeUsers(
        rows.map((row) => row.id),
        context.signal,
      );
    },
  },
});
```

Throw `AltEditorLiteError` for safe user-facing messages, field errors, and retry
behavior. Unknown exceptions are replaced with the localized generic error. See
[Operations](docs/operations.md) for cancellation and snapshot semantics.

## Localization

Included languages can be imported without registering source files manually:

```ts
import ja from 'datatables-alteditor-lite/locales/ja';

const editor = new AltEditorLite(table, { fields, language: ja });
```

Applications and CDN users can load their own partial JSON resource without
modifying or rebuilding the library:

```ts
import { loadEditorLanguage } from 'datatables-alteditor-lite';

const language = await loadEditorLanguage('/languages/fr-FR.json');
const editor = new AltEditorLite(table, { fields, language });
```

See [Localization](docs/localization.md) for the resource shape, placeholders, and
Browser Global registry.

## Browser Global usage

Load DataTables and optional extensions first, followed by AltEditorLite:

```html
<link rel="stylesheet" href="alt-editor-lite.css" />
<script src="dataTables.js"></script>
<script src="dataTables.buttons.js"></script>
<script src="dataTables.select.js"></script>
<script src="datatables-alteditor-lite.js"></script>
```

The public API is available at `globalThis.DataTablesAltEditorLite`. Included
language registration bundles load after the main bundle; external JSON languages
use `DataTablesAltEditorLite.loadEditorLanguage(...)`.

See [Browser Global](docs/browser-global.md) for load order and published paths.

## Events

Listen directly on the owned table element. Events are observation-only, do not
bubble, and cannot cancel an operation.

```ts
table
  .table()
  .node()
  .addEventListener('alteditor-lite:success', (event) => {
    if (event instanceof CustomEvent) {
      console.log(event.detail.operation);
    }
  });
```

Create, Edit, and Remove follow `open → submit → success | error → close` when the
dialog closes. Refresh publishes start and complete phases. See
[Events](docs/events.md) for detail types and ordering.

## Demo and development

The [live demo](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/)
uses the Browser Global distribution, the official DataTables CDN, an Ajax JSON
data source, asynchronous persistence, external languages, and a separate field
type gallery.

For a local repository preview:

```bash
npm ci
npm run build
npm run demo
```

Run the complete repository checks with:

```bash
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Project status and attribution

The public API is at version `0.1.1`. This project is independent and is not
affiliated with or endorsed by the DataTables publisher. DataTables and its
extensions remain separate dependencies distributed under their own terms.

## Buy Me A Coffee

[!["Buy Me A Coffee"](https://cdn.buymeacoffee.com/buttons/v2/arial-yellow.png)](https://www.buymeacoffee.com/bensitu)

## License

[MIT](LICENSE) © Ben Situ.
