# Fields

Every field supports the optional `inlineEdit` eligibility flag. It defaults to
`false`. Text, email, number, date, time, datetime-local, checkbox, select,
textarea, and SearchSelect fields can participate when the editor uses
`editing.inline.enabled: true` and the field is editable, enabled, visible,
writable, and mapped to a column. Password, radio, file, and hidden fields remain
Dialog-only. See [Editing](editing.md).

Every field has a safe dot-separated `name`. Segments that can mutate object
prototypes are rejected. Paths contain at most five property segments. Numeric
and bracketed array indices are not supported. The default local Edit merge
recreates an edited nested branch as plain objects; applications that require a
class instance in that branch should return the reconstructed row from an Update
callback. Visible fields require a non-empty label.

Map incompatible service keys at the application boundary and keep editor field
paths simple:

```ts
interface ApiUser {
  readonly id: string;
  readonly 'display name': string;
}

interface UserRow {
  readonly id: string;
  readonly profile: { readonly name: string };
}

const toEditorRow = (record: ApiUser): UserRow => ({
  id: record.id,
  profile: { name: record['display name'] },
});
```

Use the same mapping after Create, Edit, or Refresh returns service data. This
keeps transport naming separate from form paths without weakening path safety.

Supported field types are:

| Type                                                                      | Collected value                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `text`, `email`, `password`, `date`, `time`, `datetime-local`, `textarea` | `string`                                                                        |
| `number`                                                                  | `number \| undefined`, or `number \| null` with `emptyValue: null`              |
| `checkbox`                                                                | `boolean`                                                                       |
| `radio`, `select`                                                         | exact configured `string \| number`, or `undefined`                             |
| `search-select`                                                           | exact configured `string \| number`, manual string when enabled, or `undefined` |
| `file`                                                                    | `File \| null`, data URL or `null`, or the configured multiple-value array      |
| `hidden`                                                                  | `string`                                                                        |
| `custom`                                                                  | The value type declared by its `defineCustomField<TValue>()` definition         |

Disabled fields are omitted from collection. Fields configured with `readOnly:
true` remain collectible.
`editable: false` omits the field from Create and Edit forms. Consumer labels,
descriptions, options, and error messages are rendered as text, never as HTML.
Readonly controls remain focusable for accessibility and prevent normal user
interaction; this is a presentation constraint, not an authorization boundary.
Validate and authorize submitted values in the persistence layer.
Configured defaults are checked when the editor is constructed so values that
cannot be represented by their field type fail before a dialog opens.

Edit source values are also checked against the configured field type. A mismatch
such as `null` for a text field rejects that open request, publishes
`alteditor-lite:error`, and returns the editor to `ready`; values are not silently
coerced. Normalize nullable domain values before supplying them to DataTables when
the corresponding form field uses a non-nullable value type.

The `attributes` option accepts only attributes applicable to the configured
control. For example, `min`, `max`, and `step` are accepted for number and temporal
inputs, while a radio field rejects unrelated attributes such as `placeholder`.
Event handlers, styles, and arbitrary data attributes are not applied.

## Change callbacks

Text-like and number controls notify `onChange` for each native input event.
Before a dialog callback runs, the editor collects all enabled field values so
the callback context contains the current complete value shape. Inline callbacks
receive the complete declared values from the canonical row with the current
candidate overlaid. Keep per-input work small, use the supplied `AbortSignal`,
and debounce or cache application-owned network work when appropriate. A newer
change aborts the preceding callback for the same field and prevents stale
results from replacing current state.

In multi-record Dialog Edit, one logical user change invokes `onChange` once,
regardless of the number of selected records. Its context contains known common
values and explicit overrides; preserved differing values are omitted. Merely
opening the input for a differing field does not invoke the callback.

## Field controllers and runtime state

`editor.getField(path)` returns a `FieldController<TValue>` while a Dialog form is
open. `getValue()` always returns `Promise<TValue>`. The controller also provides
`setValue`, `setVisible`, `setDisabled`, `setReadOnly`, `setRequired`, `focus`,
`validate`, `clearError`, `showError`, and `destroy`.

Programmatic `setValue()` uses the same representation rules as defaults and Edit
source values. Invalid types, unavailable choice values, and unsupported file
values throw `EditorConfigurationError`; values are never accepted through
coercion. Runtime setters change only the active rendered form and do not modify
the original field configuration.

Select, Radio, and SearchSelect expose `ChoiceFieldController<TValue>`. Narrow a
field controller before updating options:

```ts
const office = editor.getField('officeId');
if (office !== null && isChoiceFieldController(office)) {
  office.setOptions([
    { label: 'Tokyo', value: 10 },
    { label: 'New York', value: 30 },
  ]);
  const options = office.getOptions();
}
```

Dynamic Select and Radio options retain an available current value and otherwise
clear it. SearchSelect updates its local options or remote seed/cache with the
same exact value identity. Changing options does not replace a remote source.
See [Dynamic forms](forms.md) for declarative option and state changes.

## Custom fields

`defineCustomField<TValue, TOptions>()` creates a typed, consumer-owned control
definition. The returned `field<TFormValues>()` builder checks the field path,
default value, options, change callback, and validation callback against the
declared value type.

```ts
import { defineCustomField } from 'datatables-alteditor-lite';

interface UserValues {
  readonly tags: readonly string[];
}

const tags = defineCustomField<readonly string[], { readonly maximum: number }>({
  capabilities: { batch: true, inline: true },
  createController(options, context) {
    const control = document.createElement('input');
    const readTags = () =>
      control.value
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const handleInput = () => context.onUserChange();
    control.addEventListener('input', handleInput);

    return {
      control,
      destroy: () => control.removeEventListener('input', handleInput),
      focus: () => control.focus(),
      getValue: readTags,
      setDisabled: (disabled) => {
        control.disabled = disabled;
      },
      setReadOnly: (readOnly) => {
        control.readOnly = readOnly;
      },
      setRequired: (required) => {
        control.required = required;
      },
      setValue: (value) => {
        control.value = value.join(', ');
      },
      validate: () =>
        readTags().length <= options.maximum
          ? { valid: true }
          : { message: `Choose at most ${options.maximum} tags.`, valid: false },
    };
  },
  isEqual: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
});

const fields = [
  tags.field<UserValues>({
    batchEditable: true,
    inlineEdit: true,
    label: 'Tags',
    name: 'tags',
    options: { maximum: 5 },
  }),
];
```

The editor owns the surrounding label, description, error region, layout,
visibility, and ARIA references. The definition owns the control subtree and
must implement value access, state setters, focus, and idempotent cleanup.
Configure widget-specific attributes when creating the control; the general
field `attributes` property is intentionally unavailable for custom fields.

`CustomFieldControllerContext` supplies the resolved language, a lifecycle
`AbortSignal`, and `onUserChange()`. Call `onUserChange()` for logical user
changes so dependencies and configured change callbacks receive current values.
The optional adapter validation runs before the field's configured `validate`
callback. Cross-field validation and dependency handling then use the same
workflow as built-in fields.

Custom fields participate in Dialog forms by default. Multi-record and Inline
Edit support is disabled unless the definition explicitly declares
`capabilities.batch` or `capabilities.inline`. `batchEditable: false` disables
multi-record participation for any field and takes precedence over a custom
capability. File and unique fields retain their existing multi-record
restrictions.

Built-in fields compare values with `Object.is`. A custom definition can supply
`isEqual` for structured values; that comparator determines common
multi-record values and whether an Inline candidate is unchanged. Keep its
semantics stable and aligned with the values returned by the adapter. See the
[consumer tags example](../examples/custom-fields/README.md) for a complete
configuration.

## Multi-record field behavior

Multi-record Dialog Edit distinguishes a common baseline, a differing baseline,
and an explicit common override. Differing values are never represented by a
synthetic field value. A field is included in `BatchChanges` only after a real
value is supplied, and Restore removes that override.

`unique: true` fields remain visible and read-only because assigning one value to
several records would violate the field contract. File fields remain visible
with an explanation and cannot be overridden. Programmatic field updates and
dependency value patches cannot bypass either restriction. Hidden fields do not
show common or differing state and retain each record's original value.
Fields configured with `batchEditable: false` are omitted from the multi-record
form and retain each record's original value.

## Local uniqueness

Set `unique: true` on a field to reject a value already present in the records
currently exposed by the Host:

```ts
{
  label: 'Email',
  name: 'email',
  type: 'email',
  unique: true,
}
```

Edit excludes its captured source row, so keeping the current value is valid. The
comparison preserves JavaScript value identity semantics: numeric `1` and string
`'1'` are different. `DataTablesHost` enumerates currently loaded rows;
`StandaloneHost` uses its configured `records` provider. This is a fast local
usability check, not a persistence guarantee. Server-side, paged, filtered,
unloaded, or concurrently changing data can contain values the browser cannot
see, so the persistence layer must enforce the final uniqueness constraint.

## SearchSelect

SearchSelect is a typed single-value combobox with local and remote data sources.
It does not provide multiple selection, pagination, infinite scrolling, or
virtualization.

```ts
const officeField = {
  allowClear: true,
  label: 'Office',
  name: 'officeId',
  options: [
    { label: 'Tokyo', value: 10 },
    { label: 'Madrid', value: 20 },
    { disabled: true, label: 'Closed', value: 30 },
  ],
  search: { debounceMs: 100, threshold: 1 },
  sortOptions: true,
  type: 'search-select',
} as const;
```

Option values use stable DOM tokens such as `option-0`; values are never coerced
to HTML strings. Numeric `1` and string `'1'` remain distinct. Duplicate values of
the same type are rejected.

`search.threshold` is the minimum normalized query length before filtering or
remote loading starts. `search.debounceMs` delays input work; remote fields
default to 250 ms. `sortOptions` uses an `Intl.Collator` for the active locale.
`allowClear` returns `undefined`. `allowManualValue` is available only for
string-valued configurations; manual numeric parsing is not supported.

Set `search: { enabled: false }` for a choice-only combobox. Its focusable control
remains keyboard accessible, opens with Enter, Space, or ArrowDown, and exposes
the active option through combobox/listbox ARIA without accepting filter text.
Remote SearchSelect requires search and rejects this setting.

Remote fields group both callbacks under `remote`. `remote.loadOptions` owns query
results; `remote.resolveOption` independently hydrates the label for an existing
value. Each callback receives an `AbortSignal`:

```ts
const remoteOfficeField = {
  allowClear: true,
  label: 'Office',
  name: 'officeId',
  options: [{ label: 'Tokyo', value: 10 }], // optional seed/cache
  remote: {
    loadOptions: (query, { signal }) => searchOffices(query, signal),
    resolveOption: (value, { signal }) => getOffice(value, signal),
  },
  search: { debounceMs: 250, threshold: 2 },
  type: 'search-select',
} as const;
```

`setValue()` remains synchronous and `getValue()` returns a Promise. A remote
value is available while its label resolves. Search and resolution use separate
cancellation and request ownership, so a consumer that ignores the signal still
cannot let an older result overwrite current state. Loading, threshold, and query
errors stay inside the combobox through `aria-busy`, its listbox, and a polite live
status.

Applications that require centralized monitoring should record remote failures
inside these application-owned callbacks before rethrowing them.

Use at most 1,000 options for the best experience. The enforced and documented
hard limit is 5,000 options in any configured or returned result. Remote loaders
must narrow results to that bound.

For local fields, `setOptions()` retains the exact current value when it still
exists; if it disappears, the field clears. For remote fields, it updates only
the seed/cache. A matching seed immediately hydrates the selected label,
invalidates an older resolver, and does not emit a user change.

## Files

File fields return `File` objects by default, so the library does not read their
content and does not impose a default budget. Explicit `maxFileBytes` and, for
multiple files, `maxFileCount` limits still apply.

With `encoding: 'data-url'`, AltEditorLite reads the selected content into browser
memory. It therefore defaults to 5 MiB per file and at most five files for a
multiple field. Set a positive `maxFileBytes` or `maxFileCount` to replace the
corresponding default, or set it to `null` to disable that default explicitly.
Budgets are checked before any data URL read.

Browser validation and file filters are usability features; a server must
independently validate content, size, and media type. Disabling or substantially
raising a data URL budget can exhaust browser memory and should be deliberate.
Treat returned data URLs as untrusted file content. Do not insert them into active
HTML or executable frames; preview only application-approved media types under an
appropriate Content Security Policy.
