const runtimeErrorElement = document.querySelector('#demo-runtime-error');

function failDemoInitialization(message) {
  if (runtimeErrorElement !== null) {
    runtimeErrorElement.textContent = message;
    runtimeErrorElement.hidden = false;
  }
  throw new Error(message);
}

const altEditorLiteRuntime = globalThis.DataTablesAltEditorLite;
if (
  typeof globalThis.DataTable !== 'function' ||
  typeof globalThis.DataTable.Api !== 'function' ||
  typeof globalThis.DataTable.version !== 'string' ||
  typeof altEditorLiteRuntime !== 'object' ||
  altEditorLiteRuntime === null ||
  typeof altEditorLiteRuntime.AltEditorLite !== 'function'
) {
  failDemoInitialization(
    'The demonstration could not start because a required script did not load.',
  );
}

const {
  AltEditorLite,
  AltEditorLiteError,
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
const languageFileByLocale = new Map([
  ['ja', 'ja.json'],
  ['zh-CN', 'zh-cn.json'],
  ['es', 'es.json'],
]);
const fieldConfigurations = [
  { label: 'Name', name: 'name', required: true, type: 'text' },
  {
    label: 'Email',
    name: 'email',
    required: true,
    type: 'email',
    unique: true,
  },
  {
    attributes: { max: '120', min: '16' },
    label: 'Age',
    name: 'age',
    required: true,
    type: 'number',
  },
  {
    label: 'Start date',
    name: 'startDate',
    required: true,
    type: 'date',
  },
  { label: 'Notes', name: 'notes', rows: 4, type: 'textarea' },
  { label: 'Active', name: 'active', type: 'checkbox' },
  {
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
    debounceMs: 100,
    label: 'Office',
    name: 'officeId',
    options: offices,
    required: true,
    sortOptions: true,
    type: 'search-select',
  },
  { defaultValue: 'distribution-example', name: 'source', type: 'hidden' },
];
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
const employeeTableElement = document.querySelector('#employees');
let currentLocaleName = 'en';
let currentEditor;
let fieldGalleryEditor;
let nextRowId = 1000;
let nextWorkflowId = 2;
let shouldFailNextOperation = false;

const table = new DataTable('#employees', {
  ajax: {
    dataSrc: '',
    url: './data/employees.json',
  },
  columns: [
    { data: 'name' },
    { data: 'email' },
    { data: 'age' },
    { data: 'role' },
    {
      data: 'officeId',
      render(officeId) {
        return offices.find(({ value }) => value === officeId)?.label ?? 'Unknown';
      },
    },
    {
      data: 'active',
      render(isActive) {
        return isActive ? 'Yes' : 'No';
      },
    },
    { data: 'startDate' },
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

function hasDuplicateEmail(email, excludedId) {
  return table
    .rows()
    .data()
    .toArray()
    .some((row) => row.id !== excludedId && row.email === email);
}

function assertUniqueEmail(email, excludedId) {
  if (hasDuplicateEmail(email, excludedId)) {
    throw new AltEditorLiteError({
      code: 'EMAIL_CONFLICT',
      fieldErrors: { email: 'This email is already registered.' },
      message: 'Correct the highlighted field and retry.',
      retryable: true,
    });
  }
}

function createEditor(language) {
  return new AltEditorLite(table, {
    fields: fieldConfigurations,
    language,
    operations: {
      async create(values, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        assertUniqueEmail(values.email, undefined);
        return {
          active: values.active ?? false,
          age: values.age ?? 18,
          email: values.email ?? '',
          id: nextRowId++,
          name: values.name ?? '',
          notes: values.notes ?? '',
          officeId: values.officeId ?? 10,
          role: values.role ?? 'developer',
          startDate: values.startDate ?? '',
        };
      },
      async remove(_rows, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
      },
      async update(values, original, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        assertUniqueEmail(values.email ?? '', original.id);
        return {
          ...original,
          active: values.active ?? original.active,
          age: values.age ?? original.age,
          email: values.email ?? original.email,
          name: values.name ?? original.name,
          notes: values.notes ?? original.notes,
          officeId: values.officeId ?? original.officeId,
          role: values.role ?? original.role,
          startDate: values.startDate ?? original.startDate,
        };
      },
    },
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

  const resourceUrl = new URL(`../../dist/locales/${languageFileName}`, document.baseURI);
  return registerLocale(await loadEditorLanguage(resourceUrl));
}

function updateState() {
  const state = currentEditor.getState();
  editorState.textContent =
    'action' in state ? `${state.status}:${state.action}` : state.status;
  editorState.dataset.state = state.status;
}

function appendEvent(event) {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const detail = event.detail;
  const operation =
    typeof detail?.operation === 'string' ? detail.operation : 'lifecycle';
  const phase = typeof detail?.phase === 'string' ? `:${detail.phase}` : '';
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} ${operation}${phase} bubbles=${String(event.bubbles)}`;
  eventLog.prepend(item);
  while (eventLog.children.length > 30) {
    eventLog.lastElementChild?.remove();
  }
  window.setTimeout(updateState, 0);
}

for (const eventName of eventNames) {
  employeeTableElement.addEventListener(eventName, appendEvent);
}

const englishLanguage = getLocale('en');
if (englishLanguage === undefined) {
  throw new Error('The built-in English language is unavailable.');
}
currentEditor = createEditor(englishLanguage);
updateState();
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
      currentEditor.destroy();
      currentEditor = createEditor(language);
      currentLocaleName = language.locale;
      document.documentElement.lang = language.locale;
      localeStatus.textContent = getRegisteredLocaleNames().join(', ');
      updateState();
    })
    .catch(() => {
      localeSelect.value = currentLocaleName;
      localeStatus.textContent = 'Language resource unavailable';
    })
    .finally(() => {
      localeSelect.disabled = false;
    });
});

document.querySelector('#show-field-gallery').addEventListener('click', (event) => {
  if (fieldGalleryEditor !== undefined) {
    return;
  }

  const fieldGallery = document.querySelector('#field-gallery');
  fieldGallery.hidden = false;
  const workflowTable = new DataTable('#workflows', {
    columns: [
      { data: 'title' },
      { data: 'contactMethod' },
      { data: 'supportWindow' },
      {
        data: 'reviewAt',
        render(value) {
          return value.replace('T', ' ');
        },
      },
      { data: 'attachmentName' },
    ],
    data: [
      {
        attachmentName: 'None',
        contactMethod: 'email',
        id: 1,
        reviewAt: '2026-08-10T09:30',
        supportWindow: '10:00',
        title: 'Accessibility review',
      },
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
    rowId: (row) => `workflow-${String(row.id)}`,
    select: { style: 'single' },
  });
  fieldGalleryEditor = new AltEditorLite(workflowTable, {
    clientSide: {
      createRow(values) {
        return {
          attachmentName: values.attachment?.name ?? 'None',
          contactMethod: values.contactMethod ?? 'email',
          id: nextWorkflowId++,
          reviewAt: values.reviewAt ?? '',
          supportWindow: values.supportWindow ?? '',
          title: values.title ?? '',
        };
      },
      updateRow(original, values) {
        return {
          ...original,
          attachmentName: values.attachment?.name ?? original.attachmentName,
          contactMethod: values.contactMethod ?? original.contactMethod,
          reviewAt: values.reviewAt ?? original.reviewAt,
          supportWindow: values.supportWindow ?? original.supportWindow,
          title: values.title ?? original.title,
        };
      },
    },
    fields: [
      {
        label: 'Workflow title',
        name: 'title',
        required: true,
        type: 'text',
      },
      {
        defaultValue: '',
        description: 'Collected for the callback but not stored by this example.',
        label: 'Temporary access code',
        name: 'accessCode',
        required: true,
        type: 'password',
      },
      {
        label: 'Support window',
        name: 'supportWindow',
        required: true,
        type: 'time',
      },
      {
        label: 'Review date and time',
        name: 'reviewAt',
        required: true,
        type: 'datetime-local',
      },
      {
        label: 'Preferred contact',
        name: 'contactMethod',
        options: [
          { label: 'Email', value: 'email' },
          { label: 'Phone', value: 'phone' },
          { label: 'Video call', value: 'video' },
        ],
        required: true,
        type: 'radio',
      },
      {
        accept: '.pdf,image/*',
        defaultValue: null,
        description: 'Maximum file size: 1 MiB.',
        label: 'Reference file',
        maxFileBytes: 1048576,
        name: 'attachment',
        type: 'file',
      },
      { defaultValue: 'field-gallery', name: 'source', type: 'hidden' },
    ],
  });
  if (event.currentTarget instanceof HTMLButtonElement) {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Field type gallery initialized';
  }
  fieldGallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
