const runtimeErrorElement = document.querySelector('#demo-runtime-error');

function failDemoInitialization(message) {
  if (runtimeErrorElement !== null) {
    runtimeErrorElement.textContent = message;
    runtimeErrorElement.hidden = false;
  }
  throw new Error(message);
}

const altEditorLiteRuntime = globalThis.AltEditorLite;
if (
  typeof globalThis.DataTable !== 'function' ||
  typeof globalThis.DataTable.Api !== 'function' ||
  typeof globalThis.DataTable.version !== 'string' ||
  typeof altEditorLiteRuntime !== 'object' ||
  altEditorLiteRuntime === null ||
  typeof altEditorLiteRuntime.AltEditorLite !== 'function' ||
  typeof altEditorLiteRuntime.Editor !== 'function' ||
  typeof altEditorLiteRuntime.StandaloneHost !== 'function'
) {
  failDemoInitialization(
    'The demonstration could not start because a required script did not load.',
  );
}

const {
  AltEditorLite: CoreEditor,
  AltEditorLiteError,
  Editor,
  StandaloneHost,
  getLocale,
  getRegisteredLocaleNames,
  loadEditorLanguage,
  registerLocale,
} = altEditorLiteRuntime;

const offices = [
  { label: 'Tokyo', value: 10 },
  { label: 'Madrid', value: 20 },
  { label: 'New York', value: 30 },
  { label: 'Beijing', value: 40 },
  { label: 'London', value: 50 },
  { label: 'Paris', value: 60 },
  { label: 'Berlin', value: 70 },
  { label: 'Sydney', value: 80 },
  { label: 'Singapore', value: 90 },
  { label: 'Dubai', value: 100 },
  { label: 'Hong Kong', value: 110 },
  { label: 'Seoul', value: 120 },
  { disabled: true, label: 'Closed office', value: 130 },
];
const employeeStatuses = [
  { label: 'Active', value: 'active' },
  { label: 'On leave', value: 'leave' },
  { label: 'Inactive', value: 'inactive' },
];
const countries = [
  { label: 'Japan', value: 'JP' },
  { label: 'China', value: 'CN' },
  { label: 'Spain', value: 'ES' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'United States', value: 'US' },
];
const japanesePrefectures = [
  { label: 'Tokyo', value: 'tokyo' },
  { label: 'Osaka', value: 'osaka' },
];
const languageFileByLocale = new Map([
  ['ja', 'ja.json'],
  ['zh-CN', 'zh-cn.json'],
  ['es', 'es.json'],
]);
const fieldConfigurations = [
  { inlineEdit: true, label: 'Name', name: 'name', required: true, type: 'text' },
  {
    inlineEdit: true,
    label: 'Email',
    name: 'email',
    required: true,
    type: 'email',
    unique: true,
  },
  {
    attributes: { max: '120', min: '16' },
    inlineEdit: true,
    label: 'Age',
    name: 'age',
    required: true,
    type: 'number',
  },
  {
    attributes: { min: '0', step: '1000' },
    defaultValue: 60000,
    inlineEdit: true,
    label: 'Salary',
    name: 'salary',
    required: true,
    type: 'number',
  },
  {
    defaultValue: 'active',
    inlineEdit: true,
    label: 'Status',
    name: 'status',
    options: employeeStatuses,
    required: true,
    type: 'select',
  },
  {
    inlineEdit: true,
    label: 'Start date',
    name: 'startDate',
    required: true,
    type: 'date',
  },
  { label: 'Notes', name: 'notes', rows: 4, type: 'textarea' },
  { inlineEdit: true, label: 'Active', name: 'active', type: 'checkbox' },
  {
    inlineEdit: true,
    label: 'Role',
    name: 'role',
    options: [
      { label: 'Developer', value: 'developer' },
      { label: 'Designer', value: 'designer' },
      { label: 'Manager', value: 'manager' },
    ],
    required: true,
    type: 'select',
  },
  {
    allowClear: true,
    inlineEdit: true,
    label: 'Office',
    name: 'officeId',
    options: offices,
    required: true,
    search: { debounceMs: 100 },
    sortOptions: true,
    type: 'search-select',
  },
  {
    defaultValue: 'JP',
    label: 'Country',
    name: 'country',
    options: countries,
    required: true,
    type: 'select',
  },
  {
    label: 'Prefecture',
    name: 'prefecture',
    options: [{ label: 'Not applicable', value: '' }, ...japanesePrefectures],
    type: 'select',
    visible: false,
  },
  {
    defaultValue: 'employee',
    label: 'Employment type',
    name: 'employmentType',
    options: [
      { label: 'Employee', value: 'employee' },
      { label: 'Contractor', value: 'contractor' },
    ],
    required: true,
    type: 'select',
  },
  {
    defaultValue: '',
    label: 'Contract end',
    name: 'contractEnd',
    type: 'date',
    visible: false,
  },
  { defaultValue: 'distribution-example', name: 'source', type: 'hidden' },
];
const hoverFieldConfigurations = fieldConfigurations.map((field) =>
  field.type === 'search-select'
    ? {
        ...field,
        remote: {
          loadOptions: async (query, { signal }) => {
            await waitForLatency(signal);
            const normalizedQuery = query.trim().toLocaleLowerCase();
            return offices.filter(({ label }) =>
              label.toLocaleLowerCase().includes(normalizedQuery),
            );
          },
          resolveOption: async (value, { signal }) => {
            await waitForLatency(signal);
            return offices.find((option) => option.value === value);
          },
        },
        options: offices.slice(0, 2),
        search: { debounceMs: 250 },
      }
    : field,
);
const eventNames = [
  'alteditor-lite:open',
  'alteditor-lite:submit',
  'alteditor-lite:success',
  'alteditor-lite:error',
  'alteditor-lite:close',
  'alteditor-lite:refresh',
  'alteditor-lite:destroy',
];

const eventLog = document.querySelector('#event-log');
const editorState = document.querySelector('#editor-state');
const failNextButton = document.querySelector('#fail-next');
const localeSelect = document.querySelector('#locale-select');
const localeStatus = document.querySelector('#locale-status');
const hybridSelectionStatus = document.querySelector('#hybrid-selection-status');
const hybridEmployeeTableElement = document.querySelector('#employees');
const inlineEmployeeTableElement = document.querySelector('#employees-inline');
const hoverEmployeeTableElement = document.querySelector('#employees-hover');
const createRecordButton = document.querySelector('#create-record');
const editRecordButton = document.querySelector('#edit-record');
const removeRecordButton = document.querySelector('#remove-record');
const emptyRecord = document.querySelector('#empty-record');
const recordValues = document.querySelector('#record-values');
const recordName = document.querySelector('#record-name');
const recordEmail = document.querySelector('#record-email');
const standaloneStatus = document.querySelector('#standalone-status');
const standaloneSection = document.querySelector('#standalone-example');

let currentLocaleName = 'en';
let hybridEmployeeEditor;
let inlineEmployeeEditor;
let hoverEmployeeEditor;
let nextRowId = 1000;
let shouldFailNextOperation = false;

function createEmployeeTable(selector, additionalOptions = {}) {
  return new DataTable(selector, {
    ajax: {
      dataSrc: '',
      url: './data/employees.json',
    },
    columns: [
      { data: 'name', name: 'name' },
      { data: 'email', name: 'email' },
      { data: 'age', name: 'age' },
      {
        data: 'salary',
        name: 'salary',
        render(salary, type) {
          return type === 'display'
            ? Number(salary).toLocaleString(document.documentElement.lang)
            : salary;
        },
      },
      {
        data: 'status',
        name: 'status',
        render(status) {
          return (
            employeeStatuses.find(({ value }) => value === status)?.label ?? 'Unknown'
          );
        },
      },
      { data: 'role', name: 'role' },
      {
        data: 'officeId',
        name: 'officeId',
        render(officeId) {
          return offices.find(({ value }) => value === officeId)?.label ?? 'Unknown';
        },
      },
      {
        data: 'active',
        name: 'active',
        render(isActive) {
          return isActive ? 'Yes' : 'No';
        },
      },
      { data: 'startDate', name: 'startDate' },
    ],
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
    rowId: (row) => `employee-${String(row.id)}`,
    select: { style: 'multi' },
    ...additionalOptions,
  });
}

const hybridEmployeeTable = createEmployeeTable('#employees', {
  select: { style: 'multi' },
});
const inlineEmployeeTable = createEmployeeTable('#employees-inline');
const hoverEmployeeTable = createEmployeeTable('#employees-hover', {
  colReorder: true,
  keys: true,
  select: { style: 'single' },
});

function waitForLatency(signal) {
  return new Promise((resolve, reject) => {
    const timerId = window.setTimeout(resolve, 350);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timerId);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      { once: true },
    );
  });
}

function throwRequestedFailure() {
  if (!shouldFailNextOperation) {
    return;
  }

  shouldFailNextOperation = false;
  failNextButton.textContent = 'Fail the next persistence request';
  delete failNextButton.dataset.armed;
  throw new AltEditorLiteError({
    code: 'PERSISTENCE_FAILURE',
    message: 'The simulated persistence request failed. Retry the operation.',
    retryable: true,
  });
}

function hasDuplicateEmail(table, email, excludedId) {
  return table
    .rows()
    .data()
    .toArray()
    .some((row) => row.id !== excludedId && row.email === email);
}

function assertUniqueEmail(table, email, excludedId) {
  if (hasDuplicateEmail(table, email, excludedId)) {
    throw new AltEditorLiteError({
      code: 'EMAIL_CONFLICT',
      fieldErrors: { email: 'This email is already registered.' },
      message: 'Correct the highlighted field and retry.',
      retryable: true,
    });
  }
}

function applyEmployeeChanges(original, values) {
  return {
    ...original,
    active: values.active ?? original.active,
    age: values.age ?? original.age,
    contractEnd: values.contractEnd ?? original.contractEnd,
    country: values.country ?? original.country,
    email: values.email ?? original.email,
    employmentType: values.employmentType ?? original.employmentType,
    name: values.name ?? original.name,
    notes: values.notes ?? original.notes,
    officeId: values.officeId ?? original.officeId,
    prefecture: values.prefecture ?? original.prefecture,
    role: values.role ?? original.role,
    salary: values.salary ?? original.salary,
    startDate: values.startDate ?? original.startDate,
    status: values.status ?? original.status,
  };
}

function createEmployeeEditor(table, inlineActivation, language, dialogEnabled = false) {
  return new Editor(table, {
    dependencies: {
      country: (country, { values }) => {
        const usesPrefecture = country === 'JP';
        const currentPrefecture = values.prefecture;
        const hasCurrentPrefecture = japanesePrefectures.some(
          ({ value }) => value === currentPrefecture,
        );
        return {
          prefecture: {
            options: usesPrefecture ? japanesePrefectures : [],
            required: usesPrefecture,
            value: usesPrefecture
              ? hasCurrentPrefecture
                ? currentPrefecture
                : 'tokyo'
              : undefined,
            visible: usesPrefecture,
          },
        };
      },
      employmentType: (employmentType) => ({
        contractEnd: {
          required: employmentType === 'contractor',
          visible: employmentType === 'contractor',
        },
      }),
    },
    editing: {
      dialog: {
        enabled: dialogEnabled,
        template: '#employee-editor-template',
      },
      inline: {
        activation: inlineActivation ?? 'doubleClick',
        enabled: inlineActivation !== undefined,
      },
    },
    fields: inlineActivation === 'hover' ? hoverFieldConfigurations : fieldConfigurations,
    language,
    operations: {
      async create(values, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        assertUniqueEmail(table, values.email, undefined);
        return {
          active: values.active ?? false,
          age: values.age ?? 18,
          contractEnd: values.contractEnd ?? '',
          country: values.country ?? 'JP',
          email: values.email ?? '',
          employmentType: values.employmentType ?? 'employee',
          id: nextRowId++,
          name: values.name ?? '',
          notes: values.notes ?? '',
          officeId: values.officeId ?? 10,
          prefecture: values.prefecture ?? '',
          role: values.role ?? 'developer',
          salary: values.salary ?? 60000,
          startDate: values.startDate ?? '',
          status: values.status ?? 'active',
        };
      },
      async remove(_rows, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
      },
      async update(values, original, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        assertUniqueEmail(table, values.email ?? '', original.id);
        return applyEmployeeChanges(original, values);
      },
      async updateMany(changes, originals, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        return originals.map((original) => applyEmployeeChanges(original, changes));
      },
    },
    validateForm: (values) =>
      values.employmentType === 'contractor' &&
      values.contractEnd !== undefined &&
      values.startDate !== undefined &&
      values.contractEnd < values.startDate
        ? {
            fieldErrors: {
              contractEnd: 'Contract end must not precede the start date.',
            },
            message: 'Review the employment dates.',
            valid: false,
          }
        : { valid: true },
  });
}

async function getOrLoadLanguage(localeName) {
  const registeredLanguage = getLocale(localeName);
  if (registeredLanguage !== undefined) {
    return registeredLanguage;
  }

  const languageFileName = languageFileByLocale.get(localeName);
  if (languageFileName === undefined) {
    throw new Error(`No language resource is configured for "${localeName}".`);
  }

  const resourceUrl = new URL(
    `../../dist/esm/locales/${languageFileName}`,
    document.baseURI,
  );
  return registerLocale(await loadEditorLanguage(resourceUrl));
}

function describeEditorState(editor, inlineEnabled) {
  const state = editor.getState();
  const dialogState =
    'action' in state ? `${state.status}:${state.action}` : state.status;
  if (!inlineEnabled) {
    return dialogState;
  }
  const inlineState = editor.getInlineState();
  return inlineState.status === 'idle' ? dialogState : inlineState.status;
}

function updateState() {
  const hybridState = describeEditorState(hybridEmployeeEditor, true);
  const inlineState = describeEditorState(inlineEmployeeEditor, true);
  const hoverState = describeEditorState(hoverEmployeeEditor, true);
  editorState.textContent = `hybrid:${hybridState} · inline:${inlineState} · hover:${hoverState}`;
  editorState.dataset.state =
    hybridState === 'error' || inlineState === 'error' || hoverState === 'error'
      ? 'error'
      : 'ready';
}

function appendEvent(event) {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const detail = event.detail;
  const operation =
    typeof detail?.operation === 'string' ? detail.operation : 'lifecycle';
  const mode = typeof detail?.mode === 'string' ? `:${detail.mode}` : '';
  const field =
    typeof detail?.target?.fieldName === 'string' ? `:${detail.target.fieldName}` : '';
  const phase = typeof detail?.phase === 'string' ? `:${detail.phase}` : '';
  const source =
    event.currentTarget instanceof HTMLElement
      ? (event.currentTarget.dataset.demoSource ?? 'editor')
      : 'editor';
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} ${source} ${operation}${mode}${field}${phase} bubbles=${String(event.bubbles)}`;
  eventLog.prepend(item);
  while (eventLog.children.length > 30) {
    eventLog.lastElementChild?.remove();
  }
  window.setTimeout(updateState, 0);
}

function registerEventSource(tableElement, sourceName) {
  tableElement.dataset.demoSource = sourceName;
  for (const eventName of eventNames) {
    tableElement.addEventListener(eventName, appendEvent);
  }
}

function updateHybridSelectionStatus() {
  const selectedEmployees = hybridEmployeeTable.rows({ selected: true }).data().toArray();
  const selectedEmployee = selectedEmployees[0];
  if (selectedEmployee === undefined) {
    hybridSelectionStatus.textContent =
      'Select one employee for single-row editing or several employees to apply common values.';
    hybridSelectionStatus.dataset.selection = 'empty';
    return;
  }
  hybridSelectionStatus.textContent =
    selectedEmployees.length === 1
      ? `Single-row editing is ready for ${selectedEmployee.name}.`
      : `Multi-row editing is ready for ${String(selectedEmployees.length)} employees.`;
  hybridSelectionStatus.dataset.selection = 'ready';
}

function recreateEditors(language) {
  hybridEmployeeEditor?.destroy();
  inlineEmployeeEditor?.destroy();
  hoverEmployeeEditor?.destroy();
  hybridEmployeeEditor = createEmployeeEditor(
    hybridEmployeeTable,
    'doubleClick',
    language,
    true,
  );
  inlineEmployeeEditor = createEmployeeEditor(
    inlineEmployeeTable,
    'doubleClick',
    language,
  );
  hoverEmployeeEditor = createEmployeeEditor(hoverEmployeeTable, 'hover', language);
  updateHybridSelectionStatus();
  updateState();
}

const standaloneRecordTarget = 'current-record';
let standaloneRecord;

function renderStandaloneRecord() {
  const hasRecord = standaloneRecord !== undefined;
  emptyRecord.hidden = hasRecord;
  recordValues.hidden = !hasRecord;
  editRecordButton.disabled = !hasRecord;
  removeRecordButton.disabled = !hasRecord;
  recordName.textContent = standaloneRecord?.name ?? '';
  recordEmail.textContent = standaloneRecord?.email ?? '';
}

const standaloneHost = new StandaloneHost({
  eventTarget: standaloneSection,
  read(target) {
    if (target !== standaloneRecordTarget || standaloneRecord === undefined) {
      throw new Error('The requested record is no longer available.');
    }
    return standaloneRecord;
  },
  applyCreate(record) {
    standaloneRecord = record;
    return standaloneRecordTarget;
  },
  applyUpdate(_target, record) {
    standaloneRecord = record;
    return standaloneRecordTarget;
  },
  applyRemove() {
    standaloneRecord = undefined;
  },
});

const standaloneEditor = new CoreEditor(standaloneHost, {
  clientSide: {
    createRow: (values) => ({
      email: values.email ?? '',
      id: crypto.randomUUID(),
      name: values.name ?? '',
    }),
  },
  fields: [
    { label: 'Name', name: 'name', required: true, type: 'text' },
    { label: 'Email', name: 'email', required: true, type: 'email' },
  ],
  operations: {
    update(values, original) {
      if (values.name === 'Unavailable') {
        throw new AltEditorLiteError({
          code: 'NAME_UNAVAILABLE',
          message: 'Choose a different name and try again.',
          retryable: true,
        });
      }
      return {
        ...original,
        email: values.email ?? original.email,
        name: values.name ?? original.name,
      };
    },
  },
});

registerEventSource(hybridEmployeeTableElement, 'hybrid table');
registerEventSource(inlineEmployeeTableElement, 'inline table');
registerEventSource(hoverEmployeeTableElement, 'hover table');
registerEventSource(standaloneSection, 'standalone record');
hybridEmployeeTable.on('select deselect', updateHybridSelectionStatus);

const englishLanguage = getLocale('en');
if (englishLanguage === undefined) {
  throw new Error('The built-in English language is unavailable.');
}
recreateEditors(englishLanguage);
renderStandaloneRecord();
document.querySelector('#jquery-status').textContent =
  globalThis.jQuery === undefined ? 'not loaded' : 'unexpectedly present';
localeStatus.textContent = getRegisteredLocaleNames().join(', ');

failNextButton.addEventListener('click', () => {
  shouldFailNextOperation = true;
  failNextButton.textContent = 'Next request will fail';
  failNextButton.dataset.armed = 'true';
});

localeSelect.addEventListener('change', () => {
  const requestedLocaleName = localeSelect.value;
  localeSelect.disabled = true;
  localeStatus.textContent = `Loading ${requestedLocaleName}…`;

  void getOrLoadLanguage(requestedLocaleName)
    .then((language) => {
      recreateEditors(language);
      currentLocaleName = language.locale;
      document.documentElement.lang = language.locale;
      localeStatus.textContent = getRegisteredLocaleNames().join(', ');
    })
    .catch(() => {
      localeSelect.value = currentLocaleName;
      localeStatus.textContent = 'Language resource unavailable';
    })
    .finally(() => {
      localeSelect.disabled = false;
    });
});

standaloneSection.addEventListener('alteditor-lite:success', (event) => {
  renderStandaloneRecord();
  standaloneStatus.textContent = `${event.detail.operation} completed.`;
});
standaloneSection.addEventListener('alteditor-lite:error', (event) => {
  standaloneStatus.textContent = event.detail.error.message;
});
createRecordButton.addEventListener('click', () => {
  void standaloneEditor.openCreateDialog();
});
editRecordButton.addEventListener('click', () => {
  void standaloneEditor.openEditDialog(standaloneRecordTarget);
});
removeRecordButton.addEventListener('click', () => {
  void standaloneEditor.openRemoveDialog([standaloneRecordTarget]);
});
