---
audience: public
status: stable
---

# Fields

Every field has a safe dot-separated `name`. Segments that can mutate object
prototypes are rejected. Visible fields require a non-empty label.

The 0.1.0 field types are:

| Type                                                                      | Collected value                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `text`, `email`, `password`, `date`, `time`, `datetime-local`, `textarea` | `string`                                                                        |
| `number`                                                                  | `number \| undefined`, or `number \| null` with `emptyValue: null`              |
| `checkbox`                                                                | `boolean`                                                                       |
| `radio`, `select`                                                         | exact configured `string \| number`, or `undefined`                             |
| `search-select`                                                           | exact configured `string \| number`, manual string when enabled, or `undefined` |
| `file`                                                                    | `File`, data URL, or the configured multiple-value array                        |
| `hidden`                                                                  | `string`                                                                        |

Disabled fields are omitted from collection. Readonly fields remain collectible.
`editable: false` omits the field from Create and Edit forms. Consumer labels,
descriptions, options, and error messages are rendered as text, never as HTML.

## SearchSelect

SearchSelect is a local, single-value combobox. It has no remote data source,
multiple-selection mode, or virtualization in 0.1.0.

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
only for string-valued configurations; numeric manual parsing is outside 0.1.0.

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

Configure `maxFileBytes` and, for multiple files, `maxFileCount`. Budgets are
checked before data URL reads. Browser validation and file filters are usability
features; a server must independently validate content, size, and media type.
