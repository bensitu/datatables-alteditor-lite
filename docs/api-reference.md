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

`openEditDialog()` requires `editing.dialog.enabled`; Inline methods require
`editing.inline.enabled`. Both can be available on one instance. Create, Remove,
Refresh, and Dialog Edit safely cancel an active double-click Inline session. An
active hover session rejects those operations until Submit or Cancel resolves it.
Operations already owned by a dialog or refresh remain mutually exclusive.

The registered DataTables method retrieves an existing editor and never creates
one:

```ts
const editor = table.altEditorLite<TFormValues>();
// AltEditorLite<TRow, TFormValues> | null
```

## Options

`AltEditorLiteOptions<TRow, TFormValues>` contains:

| Property       | Type                                      | Description                                             |
| -------------- | ----------------------------------------- | ------------------------------------------------------- |
| `fields`       | `readonly FieldConfig<TFormValues>[]`     | Ordered Create and Edit field definitions.              |
| `editing`      | `EditingOptions<TRow, TFormValues>`       | Composable Dialog and Inline behavior.                  |
| `operations`   | `EditorOperations<TRow, TFormValues>`     | Optional synchronous or asynchronous editor operations. |
| `clientSide`   | `ClientSideOperations<TRow, TFormValues>` | Optional synchronous row mappings.                      |
| `dependencies` | `FormDependencies<TFormValues>`           | Declarative Dialog field-state resolvers.               |
| `validateForm` | `FormValidator<TRow, TFormValues>`        | Shared cross-field validator.                           |
| `language`     | `PartialEditorLanguage`                   | Language data or overrides merged with English.         |
| `hooks`        | `EditorHooks<TRow, TFormValues>`          | Lifecycle observation and veto callbacks.               |

`EditingOptions` contains independent `dialog` and `inline` objects.
`DialogEditingOptions` provides `enabled`, `template`, and `closeOnSuccess`.
`InlineEditingOptions` provides `enabled`, `activation`, `blurAction`,
`enterAction`, `tabAction`, `keyboardActivation`, exact named-column `columns`,
`updateMode`, and `className`. `DialogTemplateSource` is a selector or
consumer-owned `HTMLElement`, including `HTMLTemplateElement`.

See [Configuration](configuration.md) for defaults and the capability matrix,
[Editing](editing.md) for interaction behavior, and [Lifecycle hooks](hooks.md)
for hook contracts.

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
Visible controls also support `label`, `description`, `required`, and `readOnly`.

The package exports every concrete configuration type, `SelectOption`, remote
SearchSelect source/loader/resolver/context types, `SearchSelectSearchOptions`,
`InlineKeyboardShortcut`, `FieldPath`, `FieldPathValue`, `FieldValue`,
`FieldChangeCallback`, `FieldValidator`, and their callback context types. See
[Fields](fields.md) for value types and field-specific properties.

`FieldController<TValue>` provides `element`, `getValue(): Promise<TValue>`,
`setValue`, `isVisible` / `setVisible`, `isDisabled` / `setDisabled`, `isReadOnly`
/ `setReadOnly`, `isRequired` / `setRequired`, `focus`, `validate`, `clearError`,
`showError`, and `destroy`.

`ChoiceFieldController<TValue>` adds `getOptions()` and `setOptions()`. Use the
exported `isChoiceFieldController()` type guard before calling those methods on a
general field controller. Calling `setValue()` with a value that its field cannot
represent throws `EditorConfigurationError`. Calling `destroy()` cancels that
field's work, removes it from the current form, and makes later `getField()` calls
for the same path return `null`.

`FormController` remains available for typed integrations. Its `validate()`
method covers rendered field validation; operation submissions additionally run
the configured form-level validator.

## Dependencies and form validation

The dependency API exports:

- `FormDependencyContext<TFormValues>`;
- `FieldStatePatchFor<TFormValues, TPath>` and `ChoicePatchOptions<TValue>`;
- `FormDependencyResolver<TFormValues, TSourcePath>`;
- `FormDependencyResult<TFormValues>` and `FormDependencies<TFormValues>`;
- `defineFormDependencies<TFormValues>()` for source-path callback inference.

Resolvers receive the typed source value, immutable complete values, and an
`AbortSignal`. Results can change target `options`, `value`, `visible`,
`readOnly`, `required`, and `disabled` state.

The validation API exports:

- `FormFieldErrors<TFormValues>`;
- `FormValidationContext<TRow>`;
- `FormValidationResult<TFormValues>`;
- `FormValidator<TRow, TFormValues>`.

`FormValidationContext` contains `table`, `signal`, `operation: 'create' |
'edit'`, and `mode: 'dialog' | 'inline'`. An invalid result can contain typed
`fieldErrors` and a submission-level `message`. See [Dynamic forms](forms.md) for
runtime behavior and validation ordering.

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
