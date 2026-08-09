# SearchSelect example

```ts
import { type SearchSelectFieldConfig } from 'datatables-alteditor-lite';

const officeField = {
  allowClear: true,
  debounceMs: 100,
  label: 'Office',
  name: 'officeId',
  options: [
    { label: 'Tokyo', value: 10 },
    { label: 'Madrid', value: 20 },
  ],
  sortOptions: true,
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<EmployeeForm, number>;

editor.getField<number | undefined>('officeId')?.setOptions?.([
  { label: 'Tokyo', value: 10 },
  { label: 'New York', value: 30 },
]);
```

Numeric values stay numeric. Use no more than 5,000 local options.

Remote fields use separate query and existing-value callbacks:

```ts
const remoteOfficeField = {
  label: 'Office',
  loadOptions: (query, { signal }) => searchOffices(query, signal),
  name: 'officeId',
  resolveOption: (value, { signal }) => getOffice(value, signal),
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<EmployeeForm, number>;
```

Both paths are cancellable and stale results are ignored. A single configured or
returned result is limited to 5,000 options.
