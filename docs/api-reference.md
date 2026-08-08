# API reference

The ESM entry automatically registers AltEditorLite with the imported DataTables
runtime and exports the APIs described below. Browser Global builds expose the
same runtime values through `globalThis.DataTablesAltEditorLite`.

## AltEditorLite

```ts
new AltEditorLite<TRow, TFormValues>(table, options);
```

`TRow` is the complete DataTables row type. `TFormValues` is the nested value
shape collected from configured fields and defaults to `DeepPartial<TRow>`. One
active editor may own a table element.

| Method                                        | Result                            | Description                                                                 |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `openCreateDialog()`                          | `Promise<void>`                   | Opens Create when `operations.create` or `clientSide.createRow` is present. |
| `openEditDialog(rowSelector?)`                | `Promise<void>`                   | Opens Edit for one explicit or selected row.                                |
| `openRemoveDialog(rowSelector?)`              | `Promise<void>`                   | Opens confirmation for one or more explicit or selected rows.               |
| `openInlineEdit(rowSelector, columnSelector)` | `Promise<void>`                   | Opens one eligible cell selected through public DataTables selectors.       |
| `submitInlineEdit()`                          | `Promise<void>`                   | Validates and submits the active inline value.                              |
| `cancelInlineEdit()`                          | `Promise<void>`                   | Cancels the active inline presentation and restores cell content.           |
| `getInlineState()`                            | `Readonly<InlineEditState>`       | Returns the independent inline lifecycle state.                             |
| `isInlineEditing()`                           | `boolean`                         | Reports whether inline work is active.                                      |
| `refreshTable()`                              | `Promise<void>`                   | Runs the configured refresh operation or the default DataTables refresh.    |
| `closeDialog()`                               | `Promise<void>`                   | Closes an open dialog and aborts work owned by that dialog.                 |
| `getField<TValue>(name)`                      | `FieldController<TValue> \| null` | Returns a rendered field while a form is open.                              |
| `getState()`                                  | `Readonly<EditorState>`           | Returns the current dialog and API lifecycle state.                         |
| `destroy()`                                   | `void`                            | Releases operations, DOM, listeners, selection integration, and ownership.  |

Methods that cannot run in the current state reject or throw a typed
`AltEditorLiteError`. `destroy()` is idempotent; other instance methods are not
available after destruction.

`openEditDialog()` rejects with `EditorConfigurationError` in
`inlineDoubleClick` mode. Inline methods reject in `dialog` mode, while the
synchronous Inline state getters throw the same error immediately. Create,
Remove, and Refresh safely cancel an active Inline session before starting.
Operations already owned by a dialog or refresh remain mutually exclusive.

The registered DataTables method retrieves an existing editor and never creates
one:

```ts
const editor = table.altEditorLite<TFormValues>();
// AltEditorLite<TRow, TFormValues> | null
```

## Options

`AltEditorLiteOptions<TRow, TFormValues>` contains:

| Property         | Type                                      | Description                                              |
| ---------------- | ----------------------------------------- | -------------------------------------------------------- |
| `fields`         | `readonly FieldConfig<TFormValues>[]`     | Ordered Create and Edit field definitions.               |
| `editMode`       | `EditMode`                                | `dialog` (default) or `inlineDoubleClick`.               |
| `operations`     | `EditorOperations<TRow, TFormValues>`     | Optional synchronous or asynchronous editor operations.  |
| `clientSide`     | `ClientSideOperations<TRow, TFormValues>` | Optional synchronous row mappings.                       |
| `closeOnSuccess` | `boolean`                                 | Whether successful dialog Create and Edit close.         |
| `language`       | `PartialEditorLanguage`                   | Complete language data or overrides merged with English. |
| `inline`         | `InlineEditorOptions<TRow, TFormValues>`  | Behavior used only with `inlineDoubleClick`.             |
| `hooks`          | `EditorHooks<TRow, TFormValues>`          | Optional lifecycle observation and veto callbacks.       |

Inline options include `blurAction`, `enterAction`, `tabAction`, exact
named-column `columns` mappings, `updateMode`, and a scoped `className`. The
object is optional in Inline mode and invalid in Dialog mode. See
[Editing](editing.md) for supported field types,
selector requirements, and extension boundaries. Lifecycle hooks are described
in [Lifecycle hooks](hooks.md).

`EditorOperations` supports:

```ts
interface EditorOperations<TRow extends object, TFormValues extends object> {
  create?(
    values: Readonly<EditorValues<TFormValues>>,
    context: OperationContext<TRow>,
  ): TRow | Promise<TRow>;
  update?(
    values: Readonly<EditorValues<TFormValues>>,
    original: Readonly<TRow>,
    context: OperationContext<TRow>,
  ): TRow | Promise<TRow>;
  remove?(
    rows: readonly Readonly<TRow>[],
    context: OperationContext<TRow>,
  ): void | Promise<void>;
  refresh?(context: OperationContext<TRow>): void | Promise<void>;
}
```

Every `OperationContext` contains the public DataTables `table`, the current
`operation`, initiating `mode`, optional stable `target`, and an owned
cancellation `signal`. `ClientSideOperations` provides synchronous
`createRow(values)` and `updateRow(original, values)` mappings. See
[Configuration](configuration.md) and [Operations](operations.md) for capability
resolution and mutation timing.

## Fields

`FieldConfig<TFormValues>` is the union of the supported field configurations.
Shared properties include `name`, `defaultValue`, `editable`, `visible`,
`disabled`, `inlineEdit`, `className`, `attributes`, `onChange`, `validate`, and
`unique`.
Visible controls also support `label`, `description`, `required`, and `readonly`.

The package exports every concrete configuration type, `SelectOption`,
`FieldPath`, `FieldValue`, `FieldChangeCallback`, `FieldValidator`, and their
callback context types. See [Fields](fields.md) for value types and field-specific
properties.

`FieldController<TValue>` provides `element`, `getValue`, `setValue`,
`setDisabled`, `focus`, `validate`, `clearError`, `showError`, and `destroy`.
SearchSelect controllers additionally provide `setOptions`. `FormController` and
`FormValidationResult` are exported for typed integrations. Calling a field
controller's `destroy()` cancels that field's pending change and validation work,
removes it from the current form, and makes subsequent `getField()` calls for the
same path return `null`. Use it only when the field should be removed for the
remainder of that dialog lifecycle.

## Localization

| Export                                       | Description                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `ENGLISH_LANGUAGE`                           | Complete built-in English language object.                       |
| `resolveLanguage(language?)`                 | Merges inline language data with the English fallback.           |
| `loadEditorLanguage(resource, requestInit?)` | Loads, validates, and resolves a partial JSON language resource. |
| `registerLocale(language)`                   | Validates and stores language data by its locale identifier.     |
| `registerLocale(locale, language)`           | Registers language data under an explicit locale identifier.     |
| `getLocale(locale)`                          | Returns registered language data or `undefined`.                 |
| `getRegisteredLocaleNames()`                 | Returns locale identifiers in registration order.                |

The related public types are `AltEditorLiteLanguage`,
`EditorLanguageDefinition`, and `PartialEditorLanguage`. See
[Localization](localization.md) for resource limits, JSON structure, and CDN use.

## Errors

`AltEditorLiteError` is the public base class for messages that are safe to show
to users. Its options and properties are `message`, optional `code`, optional
`fieldErrors`, optional `cause`, and `retryable`.

The package also exports these specific error classes:

- `EditorAlreadyInitializedError`
- `EditorConfigurationError`
- `EditorDestroyedError`
- `EditorFileLimitError`
- `EditorLanguageLoadError`
- `EditorOperationBusyError`
- `EditorSelectionCountError`
- `EditorSelectionUnavailableError`
- `EditorTargetUnavailableError`

Unknown values thrown by callbacks are converted to a generic non-retryable
`AltEditorLiteError`. Throw an explicit `AltEditorLiteError` when an operation
needs to provide a safe message, field errors, or retry behavior.

## Events and state

The package exports `EditorEventName`, `EditorEventDetailMap`, concrete submit and
success detail types, `EditorCloseReason`, `DialogAction`, `EditorOperation`,
`EditorOperationMode`, `EditorOperationTarget`, `InlineEventTarget`,
`InlineEditState`, `InlineTargetSummary`, and `EditorState`. Event details are
discriminated by `type` and, where applicable, `operation` and `mode`. See
[Events](events.md) for ordering and payloads.

`EditTargetSnapshot` and `RemoveTargetSnapshot` describe the readonly row
identities captured for editing operations. `BuiltinValue`, `DeepPartial`,
`EditorValues`, and `MaybePromise` support application type definitions.

## Registration

`registerAltEditorLite(dataTable)` registers retrieval and Buttons integration
against another DataTables 3 runtime. Registration is idempotent and does not
load optional extensions. The standard ESM entry calls it automatically, so most
applications do not call this function directly.
