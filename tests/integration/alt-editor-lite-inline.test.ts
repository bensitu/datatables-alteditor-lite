import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  AltEditorLiteError,
  EditorConfigurationError,
  EditorOperationBusyError,
  type FieldConfig,
  type AltEditorLiteOptions,
  type BeforeOpenContext,
  type OperationContext,
} from '../../src/index.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface InlineValues {
  readonly name: string;
  readonly rank: number;
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
}

const fields = [
  {
    inlineEdit: true,
    label: 'Name',
    name: 'name',
    required: true,
    type: 'text',
  },
  {
    inlineEdit: true,
    label: 'Rank',
    name: 'rank',
    required: true,
    type: 'number',
  },
] as const satisfies readonly FieldConfig<InlineValues>[];

const editors = new Set<AltEditorLite<TestRow, InlineValues>>();
let originalShowModalDescriptor: PropertyDescriptor | undefined;
let originalCloseDescriptor: PropertyDescriptor | undefined;

const namedColumns = [
  { data: 'name', name: 'displayName' },
  { data: 'rank', name: 'rank' },
] as const;

beforeAll(() => {
  originalShowModalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  originalCloseDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = false;
    },
  });
});

afterAll(() => {
  if (originalShowModalDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  } else {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShowModalDescriptor,
    );
  }
  if (originalCloseDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalCloseDescriptor);
  }
});

afterEach(() => {
  for (const editor of editors) {
    editor.destroy();
  }
  editors.clear();
  destroyTestTables();
});

function createDeferred<TValue>(): Deferred<TValue> {
  let resolver: ((value: TValue) => void) | undefined;
  return {
    promise: new Promise<TValue>((resolve) => {
      resolver = resolve;
    }),
    resolve(value): void {
      if (resolver === undefined) {
        throw new Error('Expected a deferred resolver.');
      }
      resolver(value);
    },
  };
}

function createInlineEditor(
  options: ConstructorParameters<typeof AltEditorLite<TestRow, InlineValues>>[1] = {
    fields,
    editMode: 'inlineDoubleClick',
  },
) {
  const fixture = createTestTable();
  const editor = new AltEditorLite<TestRow, InlineValues>(fixture.api, options);
  editors.add(editor);
  return { ...fixture, editor };
}

function replaceInlineValue(value: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.alteditor-lite-inline input');
  if (input === null) {
    throw new Error('Expected an inline input.');
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

describe('AltEditorLite programmatic inline editing', () => {
  it('enforces the configured Edit presentation and refresh ownership', async () => {
    const { api } = createTestTable('inline-disabled');
    const disabledEditor = new AltEditorLite<TestRow, InlineValues>(api, { fields });
    editors.add(disabledEditor);
    expect(() => disabledEditor.getInlineState()).toThrow(
      'Inline Edit is unavailable in dialog mode.',
    );
    await expect(disabledEditor.openInlineEdit('#row-a', 0)).rejects.toThrow(
      'Inline Edit is unavailable in dialog mode.',
    );
    disabledEditor.destroy();
    editors.delete(disabledEditor);
    api.destroy();

    const inlineFixture = createTestTable('inline-edit-mode');
    const inlineEditor = new AltEditorLite<TestRow, InlineValues>(inlineFixture.api, {
      editMode: 'inlineDoubleClick',
      fields,
    });
    editors.add(inlineEditor);
    await expect(inlineEditor.openEditDialog('#row-a')).rejects.toThrow(
      'Dialog Edit is unavailable in inlineDoubleClick mode.',
    );
    inlineEditor.destroy();
    editors.delete(inlineEditor);
    inlineFixture.api.destroy();

    const refreshFixture = createTestTable('inline-invalid-refresh');
    expect(
      () =>
        new AltEditorLite<TestRow, InlineValues>(refreshFixture.api, {
          fields,
          editMode: 'inlineDoubleClick',
          inline: { updateMode: 'refresh' },
          operations: {
            update: (_values, original) => original,
          },
        }),
    ).toThrow(EditorConfigurationError);
  });

  it('uses exact data-source mapping and the safe declared-field merge', async () => {
    const { api, editor, tableElement } = createInlineEditor();
    const eventOrder: string[] = [];
    for (const eventName of [
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]) {
      tableElement.addEventListener(eventName, (event) => {
        eventOrder.push(event.type);
      });
    }

    await editor.openInlineEdit('#row-a', 0);
    expect(editor.getInlineState()).toMatchObject({
      status: 'editing',
      target: { columnIndex: 0, fieldName: 'name', rowId: 'row-a' },
    });
    expect(
      document.querySelector<HTMLInputElement>('.alteditor-lite-inline input')?.value,
    ).toBe('Alpha');
    replaceInlineValue('Inline Alpha');
    await editor.submitInlineEdit();

    expect(api.row('#row-a').data()).toEqual({
      id: 'row-a',
      name: 'Inline Alpha',
      rank: 1,
    });
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(eventOrder).toEqual([
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]);
  });

  it('keeps other editor operations blocked until the inline session ends', async () => {
    const { editor } = createInlineEditor({
      clientSide: {
        createRow: () => ({ id: 'row-c', name: 'Gamma', rank: 3 }),
      },
      editMode: 'inlineDoubleClick',
      fields,
    });
    await editor.openInlineEdit('#row-a', 0);

    await expect(editor.openCreateDialog()).rejects.toBeInstanceOf(
      EditorOperationBusyError,
    );
    await expect(editor.openRemoveDialog('#row-b')).rejects.toBeInstanceOf(
      EditorOperationBusyError,
    );
    await expect(editor.refreshTable()).rejects.toBeInstanceOf(EditorOperationBusyError);

    await editor.cancelInlineEdit();
    await editor.refreshTable();
  });

  it('defers the latest change callback failure until submission', async () => {
    const onError = vi.fn();
    const { api, editor } = createInlineEditor({
      editMode: 'inlineDoubleClick',
      fields: [
        {
          inlineEdit: true,
          label: 'Name',
          name: 'name',
          onChange: (value) => {
            if (value === 'Blocked') {
              throw new AltEditorLiteError({
                code: 'CHANGE_REJECTED',
                fieldErrors: { name: 'Choose another name.' },
                message: 'The change callback rejected this value.',
                retryable: true,
              });
            }
          },
          type: 'text',
        },
      ],
      hooks: { onError },
    });
    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Blocked');
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(
      document.querySelector<HTMLDialogElement>('.dt-alteditor-lite-dialog--alert')?.open,
    ).toBe(false);

    const blockedSubmission = editor.submitInlineEdit();
    const blockedExpectation = expect(blockedSubmission).rejects.toMatchObject({
      code: 'CHANGE_REJECTED',
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLDialogElement>('.dt-alteditor-lite-dialog--alert')
          ?.open,
      ).toBe(true);
    });
    document
      .querySelector<HTMLButtonElement>(
        '.dt-alteditor-lite-dialog--alert .dt-alteditor-lite-dialog__button',
      )
      ?.click();
    await blockedExpectation;

    replaceInlineValue('Allowed');
    await editor.submitInlineEdit();
    expect(api.row('#row-a').data().name).toBe('Allowed');
  });

  it('keeps invalid and failed candidates open for correction or retry', async () => {
    let attempt = 0;
    const update = vi.fn(
      (
        values: Readonly<Partial<InlineValues>>,
        original: Readonly<TestRow>,
        context: OperationContext<TestRow>,
      ) => {
        expect(context.mode).toBe('inline');
        expect(context.target).toMatchObject({
          columnIndex: 0,
          fieldNames: ['name'],
          rowId: 'row-a',
        });
        attempt += 1;
        if (attempt === 1) {
          throw new AltEditorLiteError({
            code: 'TEMPORARY',
            message: 'Retry the update.',
            retryable: true,
          });
        }
        return { ...original, name: values.name ?? original.name };
      },
    );
    const { api, editor } = createInlineEditor({
      fields,
      editMode: 'inlineDoubleClick',
      operations: { update },
    });

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('');
    const invalidSubmission = editor.submitInlineEdit();
    const invalidExpectation = expect(invalidSubmission).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.dt-alteditor-lite-dialog--alert')).toHaveProperty(
        'open',
        true,
      );
    });
    document
      .querySelector<HTMLButtonElement>(
        '.dt-alteditor-lite-dialog--alert .dt-alteditor-lite-dialog__button',
      )
      ?.click();
    await invalidExpectation;
    expect(editor.getInlineState().status).toBe('error');
    expect(update).not.toHaveBeenCalled();

    replaceInlineValue('Retried Alpha');
    const failedSubmission = editor.submitInlineEdit();
    const failedExpectation = expect(failedSubmission).rejects.toMatchObject({
      code: 'TEMPORARY',
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.dt-alteditor-lite-dialog--alert')).toHaveProperty(
        'open',
        true,
      );
    });
    document
      .querySelector<HTMLButtonElement>(
        '.dt-alteditor-lite-dialog--alert .dt-alteditor-lite-dialog__button',
      )
      ?.click();
    await failedExpectation;
    expect(editor.getInlineState().status).toBe('error');
    expect(api.row('#row-a').data().name).toBe('Alpha');
    expect(
      document.querySelector<HTMLInputElement>('.alteditor-lite-inline input')?.value,
    ).toBe('Retried Alpha');

    await editor.submitInlineEdit();
    expect(api.row('#row-a').data().name).toBe('Retried Alpha');
  });

  it('supports veto-only hooks and isolates post-commit hook failures', async () => {
    let shouldSubmit = false;
    const onError = vi.fn();
    const errorEvent = vi.fn();
    const beforeSubmit = vi.fn((values: Readonly<Partial<InlineValues>>) => {
      expect(Object.isFrozen(values)).toBe(true);
      return shouldSubmit;
    });
    const { api, editor, tableElement } = createInlineEditor({
      fields,
      hooks: {
        afterSuccess: () => {
          throw new Error('Telemetry unavailable.');
        },
        beforeSubmit,
        onError,
      },
      editMode: 'inlineDoubleClick',
    });
    tableElement.addEventListener('alteditor-lite:error', errorEvent);

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Hook Alpha');
    await editor.submitInlineEdit();
    expect(editor.getInlineState().status).toBe('editing');
    expect(api.row('#row-a').data().name).toBe('Alpha');

    shouldSubmit = true;
    await editor.submitInlineEdit();
    expect(api.row('#row-a').data().name).toBe('Hook Alpha');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' }),
      expect.objectContaining({ committed: true, phase: 'afterSuccess' }),
    );
    expect(errorEvent).not.toHaveBeenCalled();
  });

  it('lets beforeOpen decline activation without publishing open or close', async () => {
    const beforeOpen = vi.fn((context: BeforeOpenContext<TestRow, InlineValues>) => {
      expect(context.mode).toBe('inline');
      return false;
    });
    const { editor, tableElement } = createInlineEditor({
      fields,
      hooks: { beforeOpen },
      editMode: 'inlineDoubleClick',
    });
    const openListener = vi.fn();
    const closeListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:open', openListener);
    tableElement.addEventListener('alteditor-lite:close', closeListener);

    await editor.openInlineEdit('#row-a', 0);

    expect(beforeOpen.mock.calls[0]?.[0]).toMatchObject({
      mode: 'inline',
      operation: 'edit',
      target: { columnIndex: 0, rowId: 'row-a' },
    });
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(openListener).not.toHaveBeenCalled();
    expect(closeListener).not.toHaveBeenCalled();
  });

  it('restores the original node identity when an API cancellation is safe', async () => {
    const { api, editor } = createInlineEditor();
    const cell = api.cell('#row-a', 0).node();
    const originalNode = cell.firstChild;

    await editor.openInlineEdit('#row-a', 0);
    expect(cell.firstChild).not.toBe(originalNode);
    await editor.cancelInlineEdit();

    expect(cell.firstChild).toBe(originalNode);
    expect(document.querySelector('.alteditor-lite-inline')).toBeNull();
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
  });

  it('cleans up a mounted session when control focus fails during open', async () => {
    const onError = vi.fn();
    const { api, editor, tableElement } = createInlineEditor({
      fields,
      hooks: { onError },
      editMode: 'inlineDoubleClick',
    });
    const cell = api.cell('#row-a', 0).node();
    const originalNode = cell.firstChild;
    const closeListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:close', closeListener);
    const focus = vi
      .spyOn(HTMLInputElement.prototype, 'focus')
      .mockImplementationOnce(() => {
        throw new Error('Focus failed.');
      });

    try {
      await expect(editor.openInlineEdit('#row-a', 0)).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    } finally {
      focus.mockRestore();
    }

    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(cell.firstChild).toBe(originalNode);
    expect(cell.classList.contains('alteditor-lite-cell--editing')).toBe(false);
    expect(document.querySelector('.alteditor-lite-inline')).toBeNull();
    expect(closeListener).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();

    await editor.openInlineEdit('#row-a', 0);
    await editor.cancelInlineEdit();
  });
});

describe('AltEditorLite inline configuration', () => {
  const invalidConfigurations: readonly [string, object, object?][] = [
    ['unknown edit mode', { editMode: 'inlineHover', fields }],
    ['inline options in dialog mode', { fields, inline: {} }],
    [
      'unknown blur action',
      { editMode: 'inlineDoubleClick', fields, inline: { blurAction: 'save' } },
    ],
    [
      'unknown Enter action',
      { editMode: 'inlineDoubleClick', fields, inline: { enterAction: 'cancel' } },
    ],
    [
      'unknown Tab action',
      { editMode: 'inlineDoubleClick', fields, inline: { tabAction: 'move' } },
    ],
    [
      'unknown update mode',
      { editMode: 'inlineDoubleClick', fields, inline: { updateMode: 'cell' } },
    ],
    [
      'unsafe class name',
      {
        editMode: 'inlineDoubleClick',
        fields,
        inline: { className: 'valid unsafe!' },
      },
    ],
    [
      'array column map',
      { editMode: 'inlineDoubleClick', fields, inline: { columns: [] } },
    ],
    [
      'unknown column name',
      {
        editMode: 'inlineDoubleClick',
        fields,
        inline: { columns: { missing: 'name' } },
      },
      { columns: namedColumns },
    ],
    [
      'unknown mapped field',
      {
        editMode: 'inlineDoubleClick',
        fields,
        inline: { columns: { displayName: 'missing' } },
      },
      { columns: namedColumns },
    ],
    [
      'field without inline eligibility',
      {
        editMode: 'inlineDoubleClick',
        fields: [{ label: 'Name', name: 'name', type: 'text' }],
        inline: { columns: { displayName: 'name' } },
      },
      { columns: namedColumns },
    ],
    [
      'unsupported mapped field',
      {
        editMode: 'inlineDoubleClick',
        fields: [
          {
            inlineEdit: true,
            label: 'Name',
            name: 'name',
            type: 'password',
          },
        ],
        inline: { columns: { displayName: 'name' } },
      },
      { columns: namedColumns },
    ],
    [
      'inline mode without an inline field',
      {
        editMode: 'inlineDoubleClick',
        fields: [{ label: 'Name', name: 'name', type: 'text' }],
      },
    ],
    [
      'inline mode with only disabled inline fields',
      {
        editMode: 'inlineDoubleClick',
        fields: [
          {
            disabled: true,
            inlineEdit: true,
            label: 'Name',
            name: 'name',
            type: 'text',
          },
        ],
      },
    ],
    [
      'duplicate column name',
      {
        editMode: 'inlineDoubleClick',
        fields,
        inline: { columns: { shared: 'name' } },
      },
      {
        columns: [
          { data: 'name', name: 'shared' },
          { data: 'rank', name: 'shared' },
        ],
      },
    ],
  ];

  it.each(invalidConfigurations)('rejects %s', (label, options, tableOptions = {}) => {
    const { api } = createTestTable(
      `invalid-inline-${label.replaceAll(/[^a-z]+/gu, '-')}`,
      tableOptions,
    );
    expect(
      () =>
        new AltEditorLite<TestRow, InlineValues>(
          api,
          options as AltEditorLiteOptions<TestRow, InlineValues>,
        ),
    ).toThrow(EditorConfigurationError);
  });

  it('does not infer a field from a function data source', async () => {
    const { api } = createTestTable('inline-function-source', {
      columns: [{ data: (row: TestRow) => row.name }, { data: 'rank' }],
    });
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields,
      editMode: 'inlineDoubleClick',
    });
    editors.add(editor);

    await expect(editor.openInlineEdit('#row-a', 0)).rejects.toMatchObject({
      code: 'TARGET_UNAVAILABLE',
    });
  });

  it('honors an explicit mapping and an explicit false column', async () => {
    const { api } = createTestTable('inline-explicit-columns', {
      columns: namedColumns,
    });
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields,
      editMode: 'inlineDoubleClick',
      inline: {
        columns: { displayName: 'name', rank: false },
      },
    });
    editors.add(editor);

    await editor.openInlineEdit('#row-a', 'displayName:name');
    expect(editor.getInlineState()).toMatchObject({
      status: 'editing',
      target: { columnName: 'displayName', fieldName: 'name' },
    });
    await editor.cancelInlineEdit();
    await expect(editor.openInlineEdit('#row-a', 'rank:name')).rejects.toMatchObject({
      code: 'TARGET_UNAVAILABLE',
    });
  });
});

describe('AltEditorLite inline interaction and redraw behavior', () => {
  it('supports delegated double-click activation and Enter submission', async () => {
    const { api, editor } = createInlineEditor();
    api
      .cell('#row-a', 0)
      .node()
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });

    const input = replaceInlineValue('Mouse Alpha');
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(api.row('#row-a').data().name).toBe('Mouse Alpha');
  });

  it('keeps textarea Enter as input and submits with Ctrl+Enter', async () => {
    const { api } = createTestTable('inline-textarea');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields: [
        {
          inlineEdit: true,
          label: 'Name',
          name: 'name',
          type: 'textarea',
        },
      ],
      editMode: 'inlineDoubleClick',
    });
    editors.add(editor);
    await editor.openInlineEdit('#row-a', 0);
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '.alteditor-lite-inline textarea',
    );
    if (textarea === null) {
      throw new Error('Expected an inline textarea.');
    }
    textarea.value = 'Multiline Alpha';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(editor.getInlineState().status).toBe('editing');

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'Enter' }),
    );
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(api.row('#row-a').data().name).toBe('Multiline Alpha');
  });

  it('leaves Enter available to a native select control', async () => {
    const { api } = createTestTable('inline-select');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields: [
        {
          inlineEdit: true,
          label: 'Rank',
          name: 'rank',
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
          ],
          type: 'select',
        },
      ],
      editMode: 'inlineDoubleClick',
    });
    editors.add(editor);
    await editor.openInlineEdit('#row-a', 1);
    const select = document.querySelector<HTMLSelectElement>(
      '.alteditor-lite-inline select',
    );
    if (select === null) {
      throw new Error('Expected an inline select.');
    }
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });

    select.dispatchEvent(enter);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(enter.defaultPrevented).toBe(false);
    expect(editor.getInlineState().status).toBe('editing');
    expect(api.row('#row-a').data().rank).toBe(1);
    await editor.cancelInlineEdit();
  });

  it('does not apply blur cancellation while validation is running', async () => {
    const validation = createDeferred<{ readonly valid: true }>();
    let validationSignal: AbortSignal | undefined;
    const { api } = createTestTable('inline-validation-blur');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields: [
        {
          inlineEdit: true,
          label: 'Name',
          name: 'name',
          type: 'text',
          validate: (_value, context) => {
            validationSignal = context.signal;
            return validation.promise;
          },
        },
      ],
      editMode: 'inlineDoubleClick',
      inline: { blurAction: 'cancel' },
    });
    editors.add(editor);
    await editor.openInlineEdit('#row-a', 0);
    const input = replaceInlineValue('Validated Alpha');
    const submission = editor.submitInlineEdit();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('validating');
    });
    const externalButton = document.createElement('button');
    document.body.append(externalButton);
    externalButton.focus();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();

    expect(editor.getInlineState().status).toBe('validating');
    expect(validationSignal?.aborted).toBe(false);

    validation.resolve({ valid: true });
    await submission;
    expect(api.row('#row-a').data().name).toBe('Validated Alpha');
  });

  it('keeps SearchSelect popup focus and Escape handling inside the session', async () => {
    const { api } = createTestTable('inline-search-select');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields: [
        {
          inlineEdit: true,
          label: 'Name',
          name: 'name',
          options: [
            { label: 'Alpha', value: 'Alpha' },
            { label: 'Beta', value: 'Beta' },
          ],
          type: 'search-select',
        },
      ],
      editMode: 'inlineDoubleClick',
    });
    editors.add(editor);
    await editor.openInlineEdit('#row-a', 0);
    const input = document.querySelector<HTMLInputElement>(
      '.alteditor-lite-inline input[role="combobox"]',
    );
    if (input === null) {
      throw new Error('Expected an inline SearchSelect input.');
    }
    expect(input.getAttribute('aria-expanded')).toBe('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(editor.getInlineState().status).toBe('editing');

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(api.row('#row-a').data().name).toBe('Alpha');
  });

  it('waits for the owned draw before opening the next Tab target', async () => {
    const { api, editor } = createInlineEditor();
    await editor.openInlineEdit('#row-a', 0);
    const input = replaceInlineValue('Tab Alpha');
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

    await vi.waitFor(() => {
      expect(editor.getInlineState()).toMatchObject({
        status: 'editing',
        target: { columnIndex: 1, rowId: 'row-a' },
      });
    });
    expect(api.row('#row-a').data().name).toBe('Tab Alpha');
    await editor.cancelInlineEdit();
  });

  it('cancels on an external draw and ignores a late persistence result', async () => {
    const deferred = createDeferred<TestRow>();
    let operationSignal: AbortSignal | undefined;
    const { api, editor, tableElement } = createInlineEditor({
      fields,
      editMode: 'inlineDoubleClick',
      operations: {
        update: (_values, _original, context) => {
          operationSignal = context.signal;
          return deferred.promise;
        },
      },
    });
    const closeListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:close', closeListener);

    await editor.openInlineEdit('#row-a', 0);
    const editedCell = api.cell('#row-a', 0).node();
    replaceInlineValue('Late Alpha');
    const submission = editor.submitInlineEdit();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('submitting');
    });
    api.draw(false);
    expect(operationSignal?.aborted).toBe(true);
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(editedCell.classList.contains('alteditor-lite-cell--editing')).toBe(false);
    deferred.resolve({ id: 'row-a', name: 'Late Alpha', rank: 1 });
    await submission;

    expect(api.row('#row-a').data().name).toBe('Alpha');
    expect(closeListener).toHaveBeenCalledOnce();
    expect(
      (closeListener.mock.calls[0]?.[0] as CustomEvent<{ reason: string }>).detail.reason,
    ).toBe('redraw');
  });

  it('stops submission when an external draw closes the session during value reading', async () => {
    const { api, editor } = createInlineEditor();

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Discarded Alpha');
    const submission = editor.submitInlineEdit();
    api.draw(false);

    await expect(submission).resolves.toBeUndefined();
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(api.row('#row-a').data().name).toBe('Alpha');
  });

  it('supports consumer-owned refresh mode with stable row-id focus recovery', async () => {
    const { api, tableElement } = createTestTable();
    let updatedName = 'Alpha';
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      fields,
      editMode: 'inlineDoubleClick',
      inline: { updateMode: 'refresh' },
      operations: {
        refresh: () => {
          const rows = api
            .rows()
            .data()
            .toArray()
            .map((row) => (row.id === 'row-a' ? { ...row, name: updatedName } : row));
          api.clear().rows.add(rows).draw(false);
        },
        update: (values, original) => {
          updatedName = values.name ?? original.name;
          return { ...original, name: updatedName };
        },
      },
    });
    editors.add(editor);

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Refreshed Alpha');
    await editor.submitInlineEdit();

    expect(api.row('#row-a').data().name).toBe('Refreshed Alpha');
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(tableElement.contains(document.activeElement)).toBe(true);
  });
});
