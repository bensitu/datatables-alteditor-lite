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
const workflowPriorities = [
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
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
    debounceMs: 100,
    inlineEdit: true,
    label: 'Office',
    name: 'officeId',
    options: offices,
    required: true,
    sortOptions: true,
    type: 'search-select',
  },
  { defaultValue: 'distribution-example', name: 'source', type: 'hidden' },
];
const hoverFieldConfigurations = fieldConfigurations.map((field) =>
  field.type === 'search-select'
    ? {
        ...field,
        debounceMs: 250,
        loadOptions: async (query, { signal }) => {
          await waitForLatency(signal);
          const normalizedQuery = query.trim().toLocaleLowerCase();
          return offices.filter(({ label }) =>
            label.toLocaleLowerCase().includes(normalizedQuery),
          );
        },
        options: offices.slice(0, 2),
        resolveOption: async (value, { signal }) => {
          await waitForLatency(signal);
          return offices.find((option) => option.value === value);
        },
      }
    : field,
);
const workflowFields = [
  {
    inlineEdit: true,
    label: 'Workflow title',
    name: 'title',
    required: true,
    type: 'text',
  },
  {
    inlineEdit: true,
    label: 'Priority',
    name: 'priority',
    options: workflowPriorities,
    required: true,
    type: 'select',
  },
  {
    defaultValue: '',
    description: 'Optional value collected for the callback but not stored.',
    label: 'Temporary access code',
    name: 'accessCode',
    type: 'password',
  },
  {
    inlineEdit: true,
    label: 'Support window',
    name: 'supportWindow',
    required: true,
    type: 'time',
  },
  {
    inlineEdit: true,
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
  { defaultValue: 'workflow-example', name: 'source', type: 'hidden' },
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
const dialogEmployeeTableElement = document.querySelector('#employees');
const inlineEmployeeTableElement = document.querySelector('#employees-inline');
const hoverEmployeeTableElement = document.querySelector('#employees-hover');
const workflowTableElement = document.querySelector('#workflows');
const workflowInlineStatus = document.querySelector('#workflow-inline-status');
const workflowModeIndicator = document.querySelector('#workflow-mode-indicator');
const workflowPriorityButton = document.querySelector('#edit-workflow-priority-inline');
const workflowSupportButton = document.querySelector('#edit-workflow-support-inline');
const toggleWorkflowModeButton = document.querySelector('#toggle-workflow-mode');

let currentLanguage;
let currentLocaleName = 'en';
let dialogEmployeeEditor;
let inlineEmployeeEditor;
let hoverEmployeeEditor;
let workflowEditor;
let workflowEditMode = 'inlineDoubleClick';
let isSwitchingWorkflowMode = false;
let isApplyingRenderedWorkflowControl = false;
let nextRowId = 1000;
let nextWorkflowId = 2;
let shouldFailNextOperation = false;

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderPriorityControl(priority, type) {
  if (type !== 'display') {
    return priority;
  }
  const options = workflowPriorities
    .map(({ label, value }) => {
      const selected = priority === value ? ' selected' : '';
      return `<option value="${escapeHtmlAttribute(value)}"${selected}>${escapeHtmlAttribute(label)}</option>`;
    })
    .join('');
  return `<select class="demo-rendered-control demo-rendered-priority" data-alteditor-lite-ignore-inline aria-label="Rendered priority">${options}</select>`;
}

function renderSupportWindowControl(supportWindow, type) {
  if (type !== 'display') {
    return supportWindow;
  }
  return `<input class="demo-rendered-control demo-rendered-support-window" data-alteditor-lite-ignore-inline aria-label="Rendered support window" type="time" value="${escapeHtmlAttribute(supportWindow)}">`;
}

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

const dialogEmployeeTable = createEmployeeTable('#employees');
const inlineEmployeeTable = createEmployeeTable('#employees-inline');
const hoverEmployeeTable = createEmployeeTable('#employees-hover', {
  colReorder: true,
  keys: true,
  select: { style: 'single' },
});
const workflowTable = new DataTable('#workflows', {
  columns: [
    { data: 'title', name: 'title' },
    { data: 'priority', name: 'priority' },
    { data: 'contactMethod', name: 'contactMethod' },
    { data: 'supportWindow', name: 'supportWindow' },
    { data: 'reviewAt', name: 'reviewAt' },
    { data: 'attachmentName', name: 'attachmentName' },
  ],
  columnDefs: [
    {
      render: renderPriorityControl,
      targets: 1,
    },
    {
      render: renderSupportWindowControl,
      targets: 3,
    },
    {
      render(value, type) {
        if (type !== 'display') {
          return value;
        }
        return typeof value === 'string' ? value.replace('T', ' ') : '';
      },
      targets: 4,
    },
  ],
  data: [
    {
      attachmentName: 'None',
      contactMethod: 'email',
      id: 1,
      priority: 'normal',
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

function createEmployeeEditor(table, editMode, language) {
  return new AltEditorLite(table, {
    editMode,
    fields: editMode === 'inlineHover' ? hoverFieldConfigurations : fieldConfigurations,
    language,
    operations: {
      async create(values, context) {
        await waitForLatency(context.signal);
        throwRequestedFailure();
        assertUniqueEmail(table, values.email, undefined);
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
        assertUniqueEmail(table, values.email ?? '', original.id);
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

const workflowEditorOptions = {
  clientSide: {
    createRow(values) {
      return {
        attachmentName: values.attachment?.name ?? 'None',
        contactMethod: values.contactMethod ?? 'email',
        id: nextWorkflowId++,
        priority: values.priority ?? 'normal',
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
        priority: values.priority ?? original.priority,
        reviewAt: values.reviewAt ?? original.reviewAt,
        supportWindow: values.supportWindow ?? original.supportWindow,
        title: values.title ?? original.title,
      };
    },
  },
  fields: workflowFields,
};

function createWorkflowEditor(language) {
  return new AltEditorLite(workflowTable, {
    ...workflowEditorOptions,
    editMode: workflowEditMode,
    language,
    ...(workflowEditMode === 'inlineDoubleClick'
      ? { inline: { blurAction: 'none' } }
      : {}),
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

function describeEditorState(editor, editMode) {
  const state = editor.getState();
  const dialogState =
    'action' in state ? `${state.status}:${state.action}` : state.status;
  if (editMode === 'dialog') {
    return dialogState;
  }
  const inlineState = editor.getInlineState();
  return inlineState.status === 'idle' ? dialogState : inlineState.status;
}

function updateState() {
  const dialogState = describeEditorState(dialogEmployeeEditor, 'dialog');
  const inlineState = describeEditorState(inlineEmployeeEditor, 'inlineDoubleClick');
  const hoverState = describeEditorState(hoverEmployeeEditor, 'inlineHover');
  editorState.textContent = `dialog:${dialogState} · inline:${inlineState} · hover:${hoverState}`;
  editorState.dataset.state =
    dialogState === 'error' || inlineState === 'error' || hoverState === 'error'
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

function updateWorkflowModeUi() {
  const usesInline = workflowEditMode === 'inlineDoubleClick';
  workflowPriorityButton.disabled = !usesInline || isSwitchingWorkflowMode;
  workflowSupportButton.disabled = !usesInline || isSwitchingWorkflowMode;
  toggleWorkflowModeButton.disabled = isSwitchingWorkflowMode;
  toggleWorkflowModeButton.textContent = usesInline
    ? 'Switch to Dialog editing'
    : 'Switch to Inline editing';
  workflowModeIndicator.textContent = usesInline
    ? 'Inline double-click mode'
    : 'Dialog mode';
  workflowModeIndicator.dataset.mode = usesInline ? 'inline' : 'dialog';
  if (!isSwitchingWorkflowMode) {
    workflowInlineStatus.textContent = usesInline
      ? 'Change a rendered priority or support window, double-click an eligible cell, or use an inline action. Rendered controls commit immediately; Enter or Tab commits other controls.'
      : 'Change a rendered priority or support window, or select the workflow and use Edit. Both paths open the complete Edit dialog.';
  }
}

function recreateEditors(language) {
  dialogEmployeeEditor?.destroy();
  inlineEmployeeEditor?.destroy();
  hoverEmployeeEditor?.destroy();
  workflowEditor?.destroy();
  dialogEmployeeEditor = createEmployeeEditor(dialogEmployeeTable, 'dialog', language);
  inlineEmployeeEditor = createEmployeeEditor(
    inlineEmployeeTable,
    'inlineDoubleClick',
    language,
  );
  hoverEmployeeEditor = createEmployeeEditor(hoverEmployeeTable, 'inlineHover', language);
  workflowEditor = createWorkflowEditor(language);
  workflowTable.row('#workflow-1').select();
  updateWorkflowModeUi();
  updateState();
}

async function openSelectedWorkflowInline(columnName) {
  const selectedIndexes = workflowTable.rows({ selected: true }).indexes().toArray();
  if (selectedIndexes.length !== 1) {
    workflowInlineStatus.textContent =
      'Select exactly one workflow before opening Inline Edit.';
    return;
  }
  try {
    await workflowEditor.openInlineEdit(selectedIndexes[0], `${columnName}:name`);
    workflowInlineStatus.textContent =
      columnName === 'priority'
        ? 'Choose a priority to commit it, or press Escape to cancel.'
        : 'Edit the support window, then press Enter or Tab to commit, or Escape to cancel.';
  } catch {
    workflowInlineStatus.textContent = 'Inline Edit is unavailable for this cell.';
  }
}

async function submitWorkflowSelect() {
  try {
    await workflowEditor.submitInlineEdit();
    workflowInlineStatus.textContent = 'The selected priority was committed.';
  } catch {
    workflowInlineStatus.textContent =
      'The priority could not be committed. Correct the value and retry.';
  }
}

async function applyRenderedWorkflowValue(renderedControl, fieldName, fieldLabel) {
  const cellNode = renderedControl.closest('td');
  const cellIndex = cellNode === null ? undefined : workflowTable.cell(cellNode).index();
  const requestedValue = renderedControl.value;
  const requestedOption =
    fieldName === 'priority'
      ? workflowPriorities.find(({ value }) => value === requestedValue)
      : undefined;
  if (
    cellIndex === undefined ||
    (fieldName === 'priority' && requestedOption === undefined)
  ) {
    workflowInlineStatus.textContent = `The requested ${fieldLabel} value is unavailable.`;
    return;
  }

  const row = workflowTable.row(cellIndex.row);
  const originalValue = row.data()[fieldName];
  renderedControl.value = originalValue;
  renderedControl.disabled = true;
  row.select();

  try {
    if (workflowEditMode === 'dialog') {
      await workflowEditor.openEditDialog(cellIndex.row);
      const field = workflowEditor.getField(fieldName);
      if (field === null) {
        throw new Error(`The ${fieldLabel} field is unavailable.`);
      }
      field.setValue(requestedValue);
      workflowInlineStatus.textContent = `The Edit dialog contains the requested ${fieldLabel} value. Submit to commit it.`;
      return;
    }

    await workflowEditor.openInlineEdit(cellIndex.row, `${fieldName}:name`);
    const activeCell = workflowTable.cell(cellIndex.row, cellIndex.column).node();
    const inlineControl = activeCell?.querySelector(
      '.alteditor-lite-inline .dt-alteditor-lite-field__control',
    );
    isApplyingRenderedWorkflowControl = true;
    if (inlineControl instanceof HTMLSelectElement) {
      const matchingOption = Array.from(inlineControl.options).find(
        (option) => option.textContent === requestedOption?.label,
      );
      if (matchingOption === undefined) {
        throw new Error(`The inline ${fieldLabel} option is unavailable.`);
      }
      inlineControl.value = matchingOption.value;
      inlineControl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (inlineControl instanceof HTMLInputElement) {
      inlineControl.value = requestedValue;
      inlineControl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      throw new Error(`The inline ${fieldLabel} control is unavailable.`);
    }
    isApplyingRenderedWorkflowControl = false;
    await workflowEditor.submitInlineEdit();
    workflowInlineStatus.textContent = `The ${fieldLabel} value was committed inline.`;
  } catch {
    isApplyingRenderedWorkflowControl = false;
    if (workflowEditMode === 'inlineDoubleClick' && workflowEditor.isInlineEditing()) {
      await workflowEditor.cancelInlineEdit().catch(() => undefined);
    }
    row.invalidate().draw(false);
    workflowInlineStatus.textContent = `The ${fieldLabel} value could not be applied. Retry from the current editing mode.`;
  } finally {
    if (renderedControl.isConnected) {
      renderedControl.disabled = false;
    }
  }
}

registerEventSource(dialogEmployeeTableElement, 'dialog table');
registerEventSource(inlineEmployeeTableElement, 'inline table');
registerEventSource(hoverEmployeeTableElement, 'hover table');
registerEventSource(workflowTableElement, 'workflow table');

const englishLanguage = getLocale('en');
if (englishLanguage === undefined) {
  throw new Error('The built-in English language is unavailable.');
}
currentLanguage = englishLanguage;
recreateEditors(currentLanguage);
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
      currentLanguage = language;
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

workflowPriorityButton.addEventListener('click', () => {
  void openSelectedWorkflowInline('priority');
});

workflowSupportButton.addEventListener('click', () => {
  void openSelectedWorkflowInline('supportWindow');
});

workflowTableElement.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLSelectElement &&
    target.classList.contains('demo-rendered-priority')
  ) {
    void applyRenderedWorkflowValue(target, 'priority', 'priority');
    return;
  }
  if (
    target instanceof HTMLInputElement &&
    target.classList.contains('demo-rendered-support-window')
  ) {
    void applyRenderedWorkflowValue(target, 'supportWindow', 'support window');
    return;
  }
  if (
    target instanceof HTMLSelectElement &&
    !isApplyingRenderedWorkflowControl &&
    workflowEditMode === 'inlineDoubleClick' &&
    target.closest('.alteditor-lite-inline') !== null
  ) {
    void submitWorkflowSelect();
  }
});

toggleWorkflowModeButton.addEventListener('click', () => {
  if (isSwitchingWorkflowMode) {
    return;
  }
  isSwitchingWorkflowMode = true;
  workflowInlineStatus.textContent = 'Switching the workflow editing mode…';
  updateWorkflowModeUi();

  void (async () => {
    const previousMode = workflowEditMode;
    let switchSucceeded = false;
    try {
      if (workflowEditMode === 'inlineDoubleClick' && workflowEditor.isInlineEditing()) {
        await workflowEditor.cancelInlineEdit();
      }
      workflowEditor.destroy();
      workflowEditMode =
        workflowEditMode === 'inlineDoubleClick' ? 'dialog' : 'inlineDoubleClick';
      try {
        workflowEditor = createWorkflowEditor(currentLanguage);
      } catch (error) {
        workflowEditMode = previousMode;
        workflowEditor = createWorkflowEditor(currentLanguage);
        throw error;
      }
      workflowTable.row('#workflow-1').select();
      switchSucceeded = true;
    } catch {
      switchSucceeded = false;
    } finally {
      isSwitchingWorkflowMode = false;
      updateWorkflowModeUi();
      if (!switchSucceeded) {
        workflowInlineStatus.textContent =
          'The editing mode could not be switched. Finish the active operation and retry.';
      }
    }
  })();
});
