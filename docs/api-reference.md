# API reference

## Package entries

| Import path                                | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `datatables-alteditor-lite`                | Host-neutral editor, contracts, fields, operations, events, and languages. |
| `datatables-alteditor-lite/datatables`     | DataTables host, facade, registration, selector targets, and snapshots.    |
| `datatables-alteditor-lite/standalone`     | Neutral API plus the callback-backed standalone host.                      |
| `datatables-alteditor-lite/style.css`      | Shared Dialog and Inline stylesheet.                                       |
| `datatables-alteditor-lite/locales/<name>` | Included ESM language module.                                              |

The neutral root and `/standalone` entries do not import DataTables. The
`/datatables` entry imports and registers against its DataTables runtime.
`datatables.net` is therefore an optional package peer, but applications using
the integration entry must install a compatible DataTables 3 release.

The `dist/umd/alt-editor-lite.js` browser build exposes the
neutral editor, DataTables adapters, and `StandaloneHost` through
`globalThis.AltEditorLite`. The namespace provides the DataTables facade as
`Editor` and the neutral constructor as `AltEditorLite`. It requires DataTables
to load first. The optional `dist/umd/alt-editor-lite-standalone.js` build exposes
`globalThis.AltEditorLiteStandalone` without a DataTables runtime.

## Neutral AltEditorLite

```ts
new AltEditorLite<TRow, TFormValues, TTarget>(host, options);
```

`TRow` is the complete canonical record type. `TFormValues` is the nested shape
collected from fields and defaults to `DeepPartial<TRow>`. `TTarget` is the opaque
identity understood by the Host. Only one active editor may own a Host's
`ownershipKey`.

| Method                          | Result                            | Description                                                                  |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `openCreateDialog()`            | `Promise<void>`                   | Opens Create when a Create implementation is configured.                     |
| `openEditDialog(target?)`       | `Promise<void>`                   | Opens Edit for one explicit or Host-selected target.                         |
| `openBatchEditDialog(targets?)` | `Promise<void>`                   | Opens Edit for at least two distinct explicit or Host-selected targets.      |
| `openRemoveDialog(targets?)`    | `Promise<void>`                   | Opens confirmation for explicit or Host-selected targets.                    |
| `openInlineEdit(target)`        | `Promise<void>`                   | Opens an inline target created by a Host that supports inline presentation.  |
| `submitInlineEdit()`            | `Promise<void>`                   | Validates and submits the active inline value.                               |
| `cancelInlineEdit()`            | `Promise<void>`                   | Cancels the active inline presentation.                                      |
| `getInlineState()`              | `Readonly<InlineEditState>`       | Returns host-neutral inline lifecycle state.                                 |
| `isInlineEditing()`             | `boolean`                         | Reports whether inline work is active.                                       |
| `refresh()`                     | `Promise<void>`                   | Runs application refresh and the configured Host refresh behavior.           |
| `closeDialog()`                 | `Promise<void>`                   | Closes an open dialog and aborts its owned work.                             |
| `getField<TValue>(name)`        | `FieldController<TValue> \| null` | Returns a rendered field while a form is open.                               |
| `getState()`                    | `Readonly<EditorState>`           | Returns the current dialog and API lifecycle state.                          |
| `destroy()`                     | `void`                            | Releases operations, presentation, listeners, Host resources, and ownership. |

Methods that cannot run in the current state reject or throw a typed
`AltEditorLiteError`. `destroy()` is idempotent; other methods are unavailable
after destruction. Starting another operation while an incompatible operation is
active rejects with `EditorOperationBusyError`; callers should await each method
and handle that rejection when requests can overlap.

## EditorHost

```ts
interface EditorHost<TRow extends object, TTarget> {
  readonly eventTarget: EventTarget;
  readonly ownershipKey: object;

  read(
    target: TTarget,
    context?: Readonly<HostReadContext>,
  ): MaybePromise<Readonly<TRow>>;
  applyCreate(
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined>;
  applyUpdate(
    target: TTarget,
    row: TRow,
    context: Readonly<HostApplyContext>,
  ): Promise<TTarget | undefined>;
  applyRemove(
    targets: readonly TTarget[],
    context: Readonly<HostApplyContext>,
  ): Promise<void>;
  destroy(): void;
}
```

Application persistence runs before `applyCreate`, `applyUpdate`, or
`applyRemove`. Each apply promise resolves only when consumer-visible Host
presentation is stable. A rejection is reported as an unapplied commit and does
not publish success.

Optional contracts add selection (`HostSelectionCapability`), refresh
(`HostRefreshCapability`), record enumeration
(`HostRowCollectionCapability`), and presentation notification
(`HostPresentationCapability`). `HostBatchUpdateCapability` adds
`applyUpdates(updates, context)` for applying ordered canonical replacements as
one operation. Inline presentation is supplied through a specialized Host
integration rather than required by every Host.

`HostReadContext` contains the cancellation signal for record capture or target
revalidation. Synchronous one-argument implementations remain compatible. Read
implementations should be side-effect free because a target can be checked more
than once during one operation.
`HostApplyContext` contains an owned `signal`, the `create`, `edit`, `batchEdit`,
or `remove` operation, and the initiating `dialog`, `inline`, or `api` mode.

## DataTables integration

```ts
import { AltEditorLite, DataTablesHost } from 'datatables-alteditor-lite/datatables';

const editor = new AltEditorLite<TRow, TFormValues>(table, options);
```

`AltEditorLite` extends the neutral editor and accepts public DataTables
selectors through these overloads:

```ts
editor.openEditDialog(rowSelector?);
editor.openBatchEditDialog(rowSelector?);
editor.openRemoveDialog(rowSelector?);
editor.openInlineEdit(rowSelector, columnSelector);
```

Its `dataTablesHost` property exposes the owned `DataTablesHost`. The host maps
selectors to opaque `DataTablesRecordTarget` and `DataTablesInlineTarget`
objects, owns draw completion, selection, refresh, extension synchronization,
and the table event target. `DataTablesHost.unwrap()` returns the original
DataTables API for deliberately integration-specific application code; it is
never injected into neutral callbacks or events.

`DataTablesHost.findRecordTarget(row)` returns an opaque target only when `row`
is the exact live object for a currently loaded DataTables record. It returns
`undefined` for detached, replaced, or unloaded row objects. Use the returned
target with Host operations instead of retaining DataTables row indexes.

The integration exports `DataTablesInlineEditState`, `InlineTargetSummary`,
`EditTargetSnapshot`, and `RemoveTargetSnapshot` for DataTables-specific
inspection. The neutral root exports only the host-neutral `InlineEditState`.

The registered method remains retrieval-only:

```ts
const current = table.altEditorLite<TFormValues>();
// active AltEditorLite instance, or null
```

It uses the table element's ownership identity and never constructs an editor.
After `destroy()`, it returns `null`.

## StandaloneHost

```ts
import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';

const host = new StandaloneHost<TRow, TTarget>({
  read,
  applyCreate,
  applyUpdate,
  applyUpdates,
  applyRemove,
  refresh,
  records,
  eventTarget,
  ownershipKey,
});
const editor = new AltEditorLite<TRow, TFormValues, TTarget>(host, options);
```

`read` is required and may return a record or a promise-like record. It receives
an optional `HostReadContext`. The apply callbacks are required only for
operations the application invokes, and each callback may return a value or a
promise-like value. `refresh` defines consumer-owned refresh work; without it,
`refresh()` completes without changing records. `eventTarget` defaults to a new
private `EventTarget`, while `ownershipKey` defaults to the Host instance.

`applyUpdates` enables multi-record editing and receives ordered `{ target, row }`
replacements after persistence succeeds. Without it, Standalone construction and
single-record operations remain available but `openBatchEditDialog` rejects.

`records` returns iterable `{ target, row }` entries for local validation. It is
optional unless any field has `unique: true`; construction rejects that
configuration when the provider is absent. Standalone supports Dialog Create,
Edit, and Remove. It intentionally does not supply DataTables inline behavior.

## Options

`AltEditorLiteOptions<TRow, TFormValues>` contains:

| Property       | Type                                      | Description                                             |
| -------------- | ----------------------------------------- | ------------------------------------------------------- |
| `fields`       | `readonly FieldConfig<TFormValues>[]`     | Ordered Create and Edit field definitions.              |
| `editing`      | `EditingOptions<TRow, TFormValues>`       | Composable Dialog and Inline behavior.                  |
| `operations`   | `EditorOperations<TRow, TFormValues>`     | Optional synchronous or asynchronous editor operations. |
| `clientSide`   | `ClientSideOperations<TRow, TFormValues>` | Optional synchronous row mappings.                      |
| `dependencies` | `FormDependencies<TFormValues>`           | Declarative Dialog field-state resolvers.               |
| `validateForm` | `FormValidator<TFormValues>`              | Shared cross-field validator.                           |
| `language`     | `PartialEditorLanguage`                   | Language data or overrides merged with English.         |
| `hooks`        | `EditorHooks<TRow, TFormValues>`          | Lifecycle observation and veto callbacks.               |

`EditingOptions` contains independent `dialog` and `inline` objects.
`DialogEditingOptions` provides `enabled`, `template`, and `closeOnSuccess`.
`InlineEditingOptions` provides `enabled`, `activation`, `blurAction`,
`enterAction`, `tabAction`, `keyboardActivation`, exact named-column `columns`,
`updateMode`, and `className`. A Host must support inline presentation before an
enabled inline configuration can be used.

`EditorOperations` supports:

```ts
interface EditorOperations<TRow extends object, TFormValues extends object> {
  create?(
    values: Readonly<EditorValues<TFormValues>>,
    context: OperationContext,
  ): TRow | Promise<TRow>;
  update?(
    values: Readonly<EditorValues<TFormValues>>,
    original: Readonly<TRow>,
    context: OperationContext,
  ): TRow | Promise<TRow>;
  updateMany?(
    changes: Readonly<BatchChanges<TFormValues>>,
    originals: readonly Readonly<TRow>[],
    context: BatchEditOperationContext,
  ): readonly TRow[] | Promise<readonly TRow[]>;
  remove?(
    rows: readonly Readonly<TRow>[],
    context: OperationContext,
  ): void | Promise<void>;
  refresh?(context: OperationContext): void | Promise<void>;
}
```

`ClientSideOperations` provides synchronous `createRow(values)` and
`updateRow(original, valuesOrChanges)` mappings. Multi-record editing passes the
override-only `BatchChanges` object to `updateRow`; it does not pass a complete
effective form. See [Configuration](configuration.md)
and [Operations](operations.md) for capability resolution and application timing.

## Contexts and targets

Operation, hook, and event contexts are discriminated by `operation` and `mode`.
The `batchEdit` branches contain ordered `targets`, `originals`, common
`changes`, and committed `rows` where applicable. Single Edit continues to use
one `target`, `original`, submitted `values`, and committed `row`.

`FormValidationContext` contains `signal` and distinguishes Create Dialog,
single Edit Dialog or Inline, and multi-record Edit Dialog. None of these
contexts contains a DataTables API.

```ts
interface EditorOperationTarget<TKey = unknown> {
  readonly key?: TKey;
  readonly fieldNames: readonly string[];
}
```

Lifecycle details use the same neutral target shape. Host event destinations are
not embedded in event details: DataTables dispatches from the table element, and
Standalone dispatches from its configured or generated `EventTarget`.

## Fields, dependencies, and validation

`FieldConfig<TFormValues>` is the union of all supported field configurations.
Shared properties include `name`, `defaultValue`, `editable`, `visible`,
`disabled`, `inlineEdit`, `batchEditable`, `className`, `onChange`, `validate`,
and `unique`. Built-in fields also accept allowlisted native `attributes`;
custom fields configure their widget subtree inside `createController()` instead.
Visible controls support `label`, `description`, `required`, and `readOnly`.

`defineCustomField<TValue, TOptions>()` returns a `CustomFieldDefinition` with a
typed `field<TFormValues>()` builder. Public custom-field contracts include
`CustomFieldAdapter`, `CustomFieldCapabilities`, `CustomFieldConfig`,
`CustomFieldConfigOptions`, `CustomFieldControllerContext`,
`CustomFieldDefinitionOptions`, `CustomFieldPresentation`, and
`FieldValueComparator`. Custom controls are available in Dialog forms;
multi-record and Inline participation require the corresponding explicit
capability. See [Fields](fields.md#custom-fields).

`FieldController<TValue>` provides `element`, asynchronous `getValue()`,
`setValue`, visibility, disabled, read-only, and required state methods, focus,
validation, error presentation, and destruction. `ChoiceFieldController` adds
`getOptions()` and `setOptions()`; use `isChoiceFieldController()` before calling
them.

Dependency exports include `FormDependencyContext`, typed field patches,
resolver/result types, `FormDependencies`, and `defineFormDependencies()`.
Validation exports include `FormFieldErrors`, `FormValidationContext`,
`FormValidationResult`, and `FormValidator`. See [Dynamic forms](forms.md).

## Localization

| Export                                   | Description                                                      |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `ENGLISH_LANGUAGE`                       | Complete built-in English language object.                       |
| `resolveLanguage(language?)`             | Merges inline language data with the English fallback.           |
| `loadEditorLanguage(resource, options?)` | Loads, validates, and resolves a partial JSON language resource. |
| `registerLocale(...)`                    | Validates and stores language data by locale identifier.         |
| `getLocale(locale)`                      | Returns registered language data or `undefined`.                 |
| `getRegisteredLocaleNames()`             | Returns locale identifiers in registration order.                |

Related types include `AltEditorLiteLanguage`, `EditorLanguageDefinition`,
`EditorLanguageLoadOptions`, and `PartialEditorLanguage`. See
[Localization](localization.md).

## Errors, events, and state

`AltEditorLiteError` is the base class for safe user-facing operation failures.
The package also exports `EditorAlreadyInitializedError`,
`EditorConfigurationError`, `EditorDestroyedError`, `EditorFileLimitError`,
`EditorLanguageLoadError`, `EditorOperationBusyError`,
`EditorSelectionCountError`, `EditorSelectionUnavailableError`, and
`EditorTargetUnavailableError`.

The neutral package exports the event names and detail map, submit/success detail
types, close reasons, dialog actions, operation and mode types,
`EditorOperationTarget`, `InlineEditState`, and `EditorState`. Event details are
discriminated by `type` and, where applicable, `operation` and `mode`. See
[Events](events.md).

## Registration

`registerAltEditorLite(dataTable)` is exported only from the `/datatables` entry
and the DataTables browser global. It registers retrieval and optional Buttons
integration against a DataTables 3 runtime. Registration is idempotent and does
not load optional extensions. Importing `/datatables` calls it automatically;
the neutral root and `/standalone` entries do not.
