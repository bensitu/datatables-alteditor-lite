# SearchSelect example

```ts
import {
  isChoiceFieldController,
  type SearchSelectFieldConfig,
} from 'datatables-alteditor-lite';

const officeField = {
  allowClear: true,
  label: 'Office',
  name: 'officeId',
  options: [
    { label: 'Tokyo', value: 10 },
    { label: 'Madrid', value: 20 },
  ],
  search: { debounceMs: 100 },
  sortOptions: true,
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<EmployeeForm, number>;

const officeController = editor.getField('officeId');
if (officeController !== null && isChoiceFieldController(officeController)) {
  officeController.setOptions([
    { label: 'Tokyo', value: 10 },
    { label: 'New York', value: 30 },
  ]);
}
```

Numeric values stay numeric. Use no more than 5,000 local options.

Remote fields use separate query and existing-value callbacks:

```ts
const remoteOfficeField = {
  label: 'Office',
  name: 'officeId',
  remote: {
    loadOptions: (query, { signal }) => searchOffices(query, signal),
    resolveOption: (value, { signal }) => getOffice(value, signal),
  },
  search: { debounceMs: 250, threshold: 2 },
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<EmployeeForm, number>;
```

Both paths are cancellable and stale results are ignored. A single configured or
returned result is limited to 5,000 options.
