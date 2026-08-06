# Fields

Every field supports the optional `inlineEdit` eligibility flag. It defaults to
`false`. Text, email, number, date, time, datetime-local, checkbox, select,
textarea, and SearchSelect fields can participate when the editor uses
`inlineDoubleClick` and the field is editable, enabled, visible, writable, and
mapped to a column.
Password, radio, file, and hidden fields remain dialog-only. See
[Editing](editing.md).

Every field has a safe dot-separated `name`. Segments that can mutate object
prototypes are rejected. Visible fields require a non-empty label.

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

Disabled fields are omitted from collection. Readonly fields remain collectible.
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

## Local uniqueness

Set `unique: true` on a field to reject a value already present in the rows
currently loaded by the owned DataTables instance:

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
`'1'` are different. This is a fast local usability check, not a persistence
guarantee. Server-side, paged, filtered, unloaded, or concurrently changing data
can contain values the browser cannot see, so the persistence layer must enforce
the final uniqueness constraint.

## SearchSelect

SearchSelect is a local, single-value combobox. It does not provide a remote data
source, multiple-selection mode, or virtualization.

```ts
const officeField = {
  allowClear: true,
  debounceMs: 100,
  label: 'Office',
  name: 'officeId',
  options: [
    { label: 'Tokyo', value: 10 },
    { label: 'Madrid', value: 20 },
    { disabled: true, label: 'Closed', value: 30 },
  ],
  searchThreshold: 1,
  sortOptions: true,
  type: 'search-select',
} as const;
```

Option values use stable DOM tokens such as `option-0`; values are never coerced
to HTML strings. Numeric `1` and string `'1'` remain distinct. Duplicate values of
the same type are rejected.

`searchThreshold` is the minimum normalized query length before filtering starts.
`debounceMs` delays local filtering. `sortOptions` uses an `Intl.Collator` for the
active locale. `allowClear` returns `undefined`. `allowManualValue` is available
only for string-valued configurations; manual numeric parsing is not supported.

Use at most 1,000 options for the best experience. The enforced and documented
hard limit is 5,000 local options. Large remote datasets and virtualization are
not supported.

While a form is open, a SearchSelect controller exposes `setOptions(options)`:

```ts
editor.getField<number | undefined>('officeId')?.setOptions?.(nextOffices);
```

The exact current value is retained when it still exists. If it disappears, the
field clears and runs its normal `onChange` callback with a non-error state.

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
