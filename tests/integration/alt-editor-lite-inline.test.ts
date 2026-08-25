import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  AltEditorLiteError,
  EditorConfigurationError,
  EditorOperationBusyError,
  type FieldConfig,
  type AltEditorLiteOptions,
  type BeforeOpenContext,
  type EditingOptions,
  type InlineActivation,
  type InlineEditingOptions,
  type EditOperationContext,
} from '../../src/datatables.js';

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

function inlineEditing(
  activation: InlineActivation = 'doubleClick',
  options: Omit<
    InlineEditingOptions<TestRow, InlineValues>,
    'activation' | 'enabled'
  > = {},
): EditingOptions<TestRow, InlineValues> {
  return {
    dialog: { enabled: false },
    inline: { ...options, activation, enabled: true },
  };
}

function uncheckedInlineEditing(
  options: Readonly<Record<string, unknown>> = {},
  activation: unknown = 'doubleClick',
): object {
  return {
    dialog: { enabled: false },
    inline: { ...options, activation, enabled: true },
  };
}

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
    editing: inlineEditing(),
    fields,
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
      'Inline Edit is disabled by editing.inline.enabled.',
    );
    await expect(disabledEditor.openInlineEdit('#row-a', 0)).rejects.toThrow(
      'Inline Edit is disabled by editing.inline.enabled.',
    );
    disabledEditor.destroy();
    editors.delete(disabledEditor);
    api.destroy();

    const inlineFixture = createTestTable('inline-edit-mode');
    const inlineEditor = new AltEditorLite<TestRow, InlineValues>(inlineFixture.api, {
      editing: inlineEditing(),
      fields,
    });
    editors.add(inlineEditor);
    await expect(inlineEditor.openEditDialog('#row-a')).rejects.toThrow(
      'Dialog Edit is disabled by editing.dialog.enabled.',
    );
    inlineEditor.destroy();
    editors.delete(inlineEditor);
    inlineFixture.api.destroy();

    const refreshFixture = createTestTable('inline-invalid-refresh');
    expect(
      () =>
        new AltEditorLite<TestRow, InlineValues>(refreshFixture.api, {
          editing: inlineEditing('doubleClick', { updateMode: 'refresh' }),
          fields,
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

  it('rejects an overlapping submission without replacing the active save', async () => {
    const { api, editor } = createInlineEditor();
    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Saved once');

    const activeSave = editor.submitInlineEdit();
    const overlappingSave = editor.submitInlineEdit();

    await expect(overlappingSave).rejects.toBeInstanceOf(EditorOperationBusyError);
    await activeSave;
    expect(api.row('#row-a').data().name).toBe('Saved once');
    expect(editor.getInlineState()).toEqual({ status: 'idle' });
  });

  it('restores the committed cell when the row id contains selector characters', async () => {
    const specialRow = { id: 'row:a.b[0]', name: 'Special', rank: 1 };
    const { api } = createTestTable('special-row-id', {
      data: [specialRow],
    });
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      editing: inlineEditing(),
      fields,
    });
    editors.add(editor);

    await editor.openInlineEdit(0, 0);
    replaceInlineValue('Updated special');
    await editor.submitInlineEdit();

    expect(api.row(0).data().name).toBe('Updated special');
    expect(document.activeElement).toBe(api.cell(0, 0).node());
  });

  it('closes an active inline session before supported editor actions', async () => {
    const { editor } = createInlineEditor({
      clientSide: {
        createRow: () => ({ id: 'row-c', name: 'Gamma', rank: 3 }),
      },
      editing: inlineEditing(),
      fields,
    });
    await editor.openInlineEdit('#row-a', 0);
    await editor.refresh();
    expect(editor.getInlineState().status).toBe('idle');

    await editor.openInlineEdit('#row-a', 0);
    await editor.openCreateDialog();
    expect(editor.getInlineState().status).toBe('idle');
    expect(editor.getState()).toMatchObject({ action: 'create', status: 'open' });
    await editor.closeDialog();

    await editor.openInlineEdit('#row-a', 0);
    await editor.openRemoveDialog('#row-b');
    expect(editor.getInlineState().status).toBe('idle');
    expect(editor.getState()).toMatchObject({ action: 'remove', status: 'open' });
    await editor.closeDialog();
  });

  it('supports dialog and inline editing on the same instance', async () => {
    const { api, editor } = createInlineEditor({
      editing: {
        dialog: { enabled: true },
        inline: { enabled: true },
      },
      fields,
    });

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Discarded Alpha');
    await editor.openEditDialog('#row-a');

    expect(editor.getInlineState()).toEqual({ status: 'idle' });
    expect(editor.getState()).toMatchObject({ action: 'edit', status: 'open' });
    expect(api.row('#row-a').data().name).toBe('Alpha');
    await editor.closeDialog();

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Hybrid Alpha');
    await editor.submitInlineEdit();
    expect(api.row('#row-a').data().name).toBe('Hybrid Alpha');
  });

  it('requires explicit resolution before a hover session yields to dialog editing', async () => {
    const { editor } = createInlineEditor({
      editing: {
        dialog: { enabled: true },
        inline: { activation: 'hover', enabled: true },
      },
      fields,
    });

    await editor.openInlineEdit('#row-a', 0);
    await expect(editor.openEditDialog('#row-a')).rejects.toBeInstanceOf(
      EditorOperationBusyError,
    );
    expect(editor.getInlineState().status).toBe('editing');
    await editor.cancelInlineEdit();
  });

  it('keeps dialog interaction ownership while inline editing is requested', async () => {
    const { editor } = createInlineEditor({
      editing: {
        dialog: { enabled: true },
        inline: { enabled: true },
      },
      fields,
    });

    await editor.openEditDialog('#row-a');
    await expect(editor.openEditDialog('#row-b')).rejects.toBeInstanceOf(
      EditorOperationBusyError,
    );
    await expect(editor.openInlineEdit('#row-a', 0)).rejects.toBeInstanceOf(
      EditorOperationBusyError,
    );
    expect(editor.getState()).toMatchObject({ action: 'edit', status: 'open' });
    await editor.closeDialog();
  });

  it('defers the latest change callback failure until submission', async () => {
    const onError = vi.fn();
    const { api, editor } = createInlineEditor({
      editing: inlineEditing(),
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
      document.querySelector<HTMLDialogElement>('.alteditor-lite-dialog--alert')?.open,
    ).toBe(false);

    const blockedSubmission = editor.submitInlineEdit();
    const blockedExpectation = expect(blockedSubmission).rejects.toMatchObject({
      code: 'CHANGE_REJECTED',
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLDialogElement>('.alteditor-lite-dialog--alert')?.open,
      ).toBe(true);
    });
    document
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-dialog--alert .alteditor-lite-dialog__button',
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
        context: EditOperationContext,
      ) => {
        expect(context.mode).toBe('inline');
        expect(context.target).toMatchObject({
          fieldNames: ['name'],
          key: 'row-a',
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
      editing: inlineEditing(),
      fields,
      operations: { update },
    });

    await editor.openInlineEdit('#row-a', 0);
    const invalidInput = replaceInlineValue('');
    invalidInput.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }),
    );
    await vi.waitFor(() => {
      expect(document.querySelector('.alteditor-lite-dialog--alert')).toHaveProperty(
        'open',
        true,
      );
    });
    document
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-dialog--alert .alteditor-lite-dialog__button',
      )
      ?.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('error');
    });
    expect(editor.getInlineState().status).toBe('error');
    expect(update).not.toHaveBeenCalled();

    replaceInlineValue('Retried Alpha');
    const failedSubmission = editor.submitInlineEdit();
    const failedExpectation = expect(failedSubmission).rejects.toMatchObject({
      code: 'TEMPORARY',
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.alteditor-lite-dialog--alert')).toHaveProperty(
        'open',
        true,
      );
    });
    document
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-dialog--alert .alteditor-lite-dialog__button',
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
    expect(editor.getInlineState().status).toBe('idle');
  });

  it('summarizes unrelated Inline field errors without submitting', async () => {
    const update = vi.fn(
      (
        values: Readonly<Partial<InlineValues>>,
        original: Readonly<TestRow>,
      ): TestRow => ({
        ...original,
        name: values.name ?? original.name,
      }),
    );
    const beforeSubmit = vi.fn(() => true);
    const { api, editor } = createInlineEditor({
      editing: inlineEditing(),
      fields,
      hooks: { beforeSubmit },
      operations: { update },
      validateForm: (values, context) => {
        expect(context.operation).toBe('edit');
        expect(context.mode).toBe('inline');
        return (values.name?.length ?? 0) > (values.rank ?? 0)
          ? {
              fieldErrors: {
                rank: 'Rank must be at least the length of the name.',
              },
              message: 'Review the related values.',
              valid: false,
            }
          : { valid: true };
      },
    });
    const original = { ...api.row('#row-a').data() };
    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Extended Alpha');

    const submission = editor.submitInlineEdit();
    const rejection = expect(submission).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.alteditor-lite-dialog--alert')).toHaveProperty(
        'open',
        true,
      );
    });

    const alertMessage = document.querySelector(
      '.alteditor-lite-dialog--alert .alteditor-lite-dialog__message',
    )?.textContent;
    expect(alertMessage).toContain('Review the related values.');
    expect(alertMessage).toContain('Rank must be at least the length of the name.');
    expect(
      document.querySelector('.alteditor-lite-inline .alteditor-lite-field__error'),
    ).toBeNull();
    document
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-dialog--alert .alteditor-lite-dialog__button',
      )
      ?.click();
    await rejection;

    expect(editor.getInlineState().status).toBe('error');
    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(api.row('#row-a').data()).toEqual(original);
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
      editing: inlineEditing(),
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
      editing: inlineEditing(),
      fields,
      hooks: { beforeOpen },
    });
    const openListener = vi.fn();
    const closeListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:open', openListener);
    tableElement.addEventListener('alteditor-lite:close', closeListener);

    await editor.openInlineEdit('#row-a', 0);

    expect(beforeOpen.mock.calls[0]?.[0]).toMatchObject({
      mode: 'inline',
      operation: 'edit',
      target: { fieldNames: ['name'], key: 'row-a' },
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

  it('preserves the activation focus target while beforeOpen is pending', async () => {
    const pending = createDeferred<undefined>();
    const beforeOpen = vi.fn(() => pending.promise);
    const { editor } = createInlineEditor({
      editing: inlineEditing(),
      fields,
      hooks: { beforeOpen },
    });
    const activationTarget = document.createElement('button');
    const laterTarget = document.createElement('button');
    document.body.append(activationTarget, laterTarget);
    activationTarget.focus();

    const opening = editor.openInlineEdit('#row-a', 0);
    await vi.waitFor(() => {
      expect(beforeOpen).toHaveBeenCalledOnce();
    });
    laterTarget.focus();
    pending.resolve(undefined);
    await opening;
    await editor.cancelInlineEdit();

    expect(document.activeElement).toBe(activationTarget);
  });

  it('cleans up a mounted session when control focus fails during open', async () => {
    const onError = vi.fn();
    const { api, editor, tableElement } = createInlineEditor({
      editing: inlineEditing(),
      fields,
      hooks: { onError },
    });
    const cell = api.cell('#row-a', 0).node();
    const originalNode = cell.firstChild;
    const closeListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:close', closeListener);
    const activationTarget = document.createElement('button');
    document.body.append(activationTarget);
    activationTarget.focus();
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
    expect(document.activeElement).toBe(activationTarget);

    await editor.openInlineEdit('#row-a', 0);
    await editor.cancelInlineEdit();
  });
});

describe('AltEditorLite hover inline editing', () => {
  function dispatchPointerEvent(
    target: EventTarget,
    type: string,
    pointerType: 'mouse' | 'touch',
  ): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerType', {
      configurable: true,
      value: pointerType,
    });
    target.dispatchEvent(event);
    return event;
  }

  async function revealTrigger(cell: HTMLTableCellElement): Promise<HTMLButtonElement> {
    cell.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    await vi.waitFor(() => {
      expect(
        cell.querySelector<HTMLButtonElement>('.alteditor-lite-inline-hover__trigger'),
      ).not.toBeNull();
    });
    const trigger = cell.querySelector<HTMLButtonElement>(
      '.alteditor-lite-inline-hover__trigger',
    );
    if (trigger === null) {
      throw new Error('Expected a hover edit trigger.');
    }
    return trigger;
  }

  it('reveals the pencil after an unclaimed touch compatibility click', async () => {
    const { api, editor } = createInlineEditor({
      editing: inlineEditing('hover'),
      fields,
    });
    const cell = api.cell('#row-a', 0).node();

    dispatchPointerEvent(cell, 'pointerup', 'touch');
    expect(cell.querySelector('.alteditor-lite-inline-hover__trigger')).toBeNull();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    cell.dispatchEvent(click);
    await Promise.resolve();

    expect(click.defaultPrevented).toBe(false);
    const trigger = cell.querySelector<HTMLButtonElement>(
      '.alteditor-lite-inline-hover__trigger',
    );
    expect(trigger).not.toBeNull();
    if (trigger === null) {
      throw new Error('Expected a touch edit trigger.');
    }
    dispatchPointerEvent(trigger, 'pointerup', 'touch');
    expect(trigger.isConnected).toBe(true);
    trigger.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    await editor.cancelInlineEdit();
  });

  it('leaves an unrelated click untouched and clears touch discovery', async () => {
    const { api, tableElement } = createInlineEditor({
      editing: inlineEditing('hover'),
      fields,
    });
    const cell = api.cell('#row-a', 0).node();
    const header = tableElement.tHead?.querySelector('th');
    if (header === null || header === undefined) {
      throw new Error('Expected a table header.');
    }

    dispatchPointerEvent(cell, 'pointerup', 'touch');
    const mismatchedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    header.dispatchEvent(mismatchedClick);
    await Promise.resolve();

    expect(mismatchedClick.defaultPrevented).toBe(false);
    expect(cell.querySelector('.alteditor-lite-inline-hover__trigger')).toBeNull();

    dispatchPointerEvent(cell, 'pointerup', 'touch');
    header.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(cell.querySelector('.alteditor-lite-inline-hover__trigger')).toBeNull();
    dispatchPointerEvent(document.body, 'pointerdown', 'touch');
    expect(cell.querySelector('.alteditor-lite-inline-hover__trigger')).toBeNull();
  });

  it('opens only from the shared trigger and resolves through explicit actions', async () => {
    const update = vi.fn(
      (values: Readonly<Partial<InlineValues>>, original: Readonly<TestRow>) => ({
        ...original,
        name: values.name ?? original.name,
      }),
    );
    const { api, editor } = createInlineEditor({
      editing: inlineEditing('hover'),
      fields,
      operations: { update },
    });
    const cell = api.cell('#row-a', 0).node();

    cell.click();
    expect(editor.isInlineEditing()).toBe(false);
    const trigger = await revealTrigger(cell);
    trigger.click();

    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    expect(cell.querySelector('.alteditor-lite-inline--actions')).not.toBeNull();
    expect(cell.querySelector('.alteditor-lite-inline-hover__trigger')).toBeNull();

    replaceInlineValue('Hover Alpha');
    const input = cell.querySelector<HTMLInputElement>('input');
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    expect(editor.getInlineState().status).toBe('editing');
    expect(update).not.toHaveBeenCalled();

    cell
      .querySelector<HTMLButtonElement>('[data-alteditor-lite-inline-action="submit"]')
      ?.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(update).toHaveBeenCalledOnce();
    expect(api.row('#row-a').data().name).toBe('Hover Alpha');
  });

  it('suspends hover discovery while editing and resumes after cancel', async () => {
    const { api, editor, tableElement } = createInlineEditor({
      editing: inlineEditing('hover'),
      fields,
    });
    const activeCell = api.cell('#row-a', 0).node();
    const otherCell = api.cell('#row-b', 0).node();

    (await revealTrigger(activeCell)).click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });

    dispatchPointerEvent(activeCell, 'pointermove', 'mouse');
    expect(
      tableElement.querySelector('.alteditor-lite-inline-hover__trigger'),
    ).toBeNull();

    dispatchPointerEvent(otherCell, 'pointermove', 'mouse');
    dispatchPointerEvent(otherCell, 'pointerup', 'touch');
    otherCell.click();
    await Promise.resolve();
    expect(
      tableElement.querySelector('.alteditor-lite-inline-hover__trigger'),
    ).toBeNull();

    await editor.cancelInlineEdit();
    expect(editor.getInlineState().status).toBe('idle');
    expect(
      tableElement.querySelector('.alteditor-lite-inline-hover__trigger'),
    ).toBeNull();
    expect((await revealTrigger(otherCell)).isConnected).toBe(true);
  });

  it('cancels without persistence and refuses external operations until resolved', async () => {
    const update = vi.fn(
      (values: Readonly<Partial<InlineValues>>, original: Readonly<TestRow>) => ({
        ...original,
        name: values.name ?? original.name,
      }),
    );
    const { api, editor } = createInlineEditor({
      clientSide: {
        createRow: () => ({ id: 'row-new', name: 'New', rank: 3 }),
      },
      editing: inlineEditing('hover'),
      fields,
      operations: { update },
    });
    const cell = api.cell('#row-a', 0).node();
    (await revealTrigger(cell)).click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    replaceInlineValue('Discarded');

    await expect(editor.openCreateDialog()).rejects.toMatchObject({
      code: 'OPERATION_BUSY',
    });
    expect(editor.getInlineState().status).toBe('editing');
    cell.querySelector<HTMLInputElement>('input')?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      }),
    );
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(update).not.toHaveBeenCalled();
    expect(api.row('#row-a').data().name).toBe('Alpha');
  });

  it('disables both actions while validation and persistence are pending', async () => {
    const pending = createDeferred<TestRow>();
    const { api } = createTestTable('inline-hover-busy');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      editing: inlineEditing('hover'),
      fields,
      operations: { update: () => pending.promise },
    });
    editors.add(editor);
    const cell = api.cell('#row-a', 0).node();
    (await revealTrigger(cell)).click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    replaceInlineValue('Pending Alpha');
    const submitButton = cell.querySelector<HTMLButtonElement>(
      '[data-alteditor-lite-inline-action="submit"]',
    );
    const cancelButton = cell.querySelector<HTMLButtonElement>(
      '[data-alteditor-lite-inline-action="cancel"]',
    );
    submitButton?.click();
    await vi.waitFor(() => {
      expect(submitButton?.disabled).toBe(true);
      expect(cancelButton?.disabled).toBe(true);
    });

    pending.resolve({ id: 'row-a', name: 'Pending Alpha', rank: 1 });
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
  });

  it('selects remote options through the shared transaction and aborts on cancel', async () => {
    let searchSignal: AbortSignal | undefined;
    const pendingSearch =
      createDeferred<readonly { readonly label: string; readonly value: number }[]>();
    const remoteFields = [
      fields[0],
      {
        allowClear: true,
        inlineEdit: true,
        label: 'Rank',
        remote: {
          loadOptions: (_query: string, { signal }: { signal: AbortSignal }) => {
            searchSignal = signal;
            return pendingSearch.promise;
          },
          resolveOption: (value: number) =>
            Promise.resolve({ label: `Rank ${String(value)}`, value }),
        },
        name: 'rank',
        search: { debounceMs: 0 },
        type: 'search-select',
      },
    ] as const satisfies readonly FieldConfig<InlineValues>[];
    const { api, editor } = createInlineEditor({
      editing: inlineEditing('hover'),
      fields: remoteFields,
    });
    const cell = api.cell('#row-a', 1).node();
    (await revealTrigger(cell)).click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    const input = cell.querySelector<HTMLInputElement>('input[role="combobox"]');
    input?.focus();
    await vi.waitFor(() => {
      expect(searchSignal).toBeDefined();
    });

    cell
      .querySelector<HTMLButtonElement>('[data-alteditor-lite-inline-action="cancel"]')
      ?.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(searchSignal?.aborted).toBe(true);
    pendingSearch.resolve([{ label: 'Rank 2', value: 2 }]);
    await Promise.resolve();
    expect(cell.querySelector('.alteditor-lite-search-select')).toBeNull();

    (await revealTrigger(cell)).click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    const nextInput = cell.querySelector<HTMLInputElement>('input[role="combobox"]');
    nextInput?.focus();
    await vi.waitFor(() => {
      expect(cell.querySelector('[role="listbox"]')?.textContent).toContain('Rank 2');
    });
    nextInput?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    );
    cell
      .querySelector<HTMLButtonElement>('[data-alteditor-lite-inline-action="submit"]')
      ?.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(api.row('#row-a').data().rank).toBe(2);
  });
});

describe('AltEditorLite inline configuration', () => {
  const invalidConfigurations: readonly [string, object, object?][] = [
    ['unknown activation', { editing: uncheckedInlineEditing({}, 'tap'), fields }],
    ['array editing options', { editing: [], fields }],
    [
      'unknown blur action',
      { editing: uncheckedInlineEditing({ blurAction: 'save' }), fields },
    ],
    [
      'unknown Enter action',
      { editing: uncheckedInlineEditing({ enterAction: 'cancel' }), fields },
    ],
    [
      'unknown Tab action',
      { editing: uncheckedInlineEditing({ tabAction: 'move' }), fields },
    ],
    [
      'unknown update mode',
      { editing: uncheckedInlineEditing({ updateMode: 'cell' }), fields },
    ],
    [
      'unsafe class name',
      {
        editing: uncheckedInlineEditing({ className: 'valid unsafe!' }),
        fields,
      },
    ],
    ['array column map', { editing: uncheckedInlineEditing({ columns: [] }), fields }],
    [
      'unknown column name',
      {
        editing: uncheckedInlineEditing({ columns: { missing: 'name' } }),
        fields,
      },
      { columns: namedColumns },
    ],
    [
      'unknown mapped field',
      {
        editing: uncheckedInlineEditing({
          columns: { displayName: 'missing' },
        }),
        fields,
      },
      { columns: namedColumns },
    ],
    [
      'field without inline eligibility',
      {
        editing: uncheckedInlineEditing({ columns: { displayName: 'name' } }),
        fields: [{ label: 'Name', name: 'name', type: 'text' }],
      },
      { columns: namedColumns },
    ],
    [
      'unsupported mapped field',
      {
        editing: uncheckedInlineEditing({ columns: { displayName: 'name' } }),
        fields: [
          {
            inlineEdit: true,
            label: 'Name',
            name: 'name',
            type: 'password',
          },
        ],
      },
      { columns: namedColumns },
    ],
    [
      'inline mode without an inline field',
      {
        editing: uncheckedInlineEditing(),
        fields: [{ label: 'Name', name: 'name', type: 'text' }],
      },
    ],
    [
      'inline mode with only disabled inline fields',
      {
        editing: uncheckedInlineEditing(),
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
        editing: uncheckedInlineEditing({ columns: { shared: 'name' } }),
        fields,
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

  it('identifies only the incompatible hover actions', () => {
    const { api } = createTestTable('invalid-inline-hover-actions');
    expect(
      () =>
        new AltEditorLite<TestRow, InlineValues>(api, {
          editing: inlineEditing('hover', { blurAction: 'submit' }),
          fields,
        }),
    ).toThrow('Hover activation requires blurAction to be "none" when configured.');
  });

  it('does not infer a field from a function data source', async () => {
    const { api } = createTestTable('inline-function-source', {
      columns: [{ data: (row: TestRow) => row.name }, { data: 'rank' }],
    });
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      editing: inlineEditing(),
      fields,
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
      editing: inlineEditing('doubleClick', {
        columns: { displayName: 'name', rank: false },
      }),
      fields,
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
  it('opens from a same-cell touch double tap without claiming other taps', async () => {
    const { api, editor } = createInlineEditor();
    const firstCell = api.cell('#row-a', 0).node();
    const otherCell = api.cell('#row-a', 1).node();
    const dispatchTouchPointer = (
      target: EventTarget,
      type: 'pointerdown' | 'pointerup',
    ): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      target.dispatchEvent(event);
      return event;
    };
    const tap = (cell: HTMLTableCellElement): readonly [MouseEvent, MouseEvent] => [
      dispatchTouchPointer(cell, 'pointerdown'),
      dispatchTouchPointer(cell, 'pointerup'),
    ];

    tap(firstCell);
    expect(editor.getInlineState().status).toBe('idle');
    tap(otherCell);
    expect(editor.getInlineState().status).toBe('idle');
    tap(firstCell);
    expect(editor.getInlineState().status).toBe('idle');
    const [secondPointerDown, secondPointerUp] = tap(firstCell);

    expect(secondPointerDown.defaultPrevented).toBe(true);
    expect(secondPointerUp.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    await editor.cancelInlineEdit();
  });

  it('supports delegated double-click activation and Enter submission', async () => {
    const { api, editor } = createInlineEditor();
    api
      .cell('#row-a', 0)
      .node()
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 2, detail: 2 }));
    await Promise.resolve();
    expect(editor.getInlineState().status).toBe('idle');

    api
      .cell('#row-a', 0)
      .node()
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 }));
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
      editing: inlineEditing(),
      fields: [
        {
          inlineEdit: true,
          label: 'Name',
          name: 'name',
          type: 'textarea',
        },
      ],
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
      editing: inlineEditing(),
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
      editing: inlineEditing('doubleClick', { blurAction: 'cancel' }),
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

  it('cancels a SearchSelect cell with one Escape press', async () => {
    const { api } = createTestTable('inline-search-select');
    const editor = new AltEditorLite<TestRow, InlineValues>(api, {
      editing: inlineEditing(),
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
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      }),
    );
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });
    expect(input.isConnected).toBe(false);
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
      editing: inlineEditing(),
      fields,
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
      editing: inlineEditing('doubleClick', { updateMode: 'refresh' }),
      fields,
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
