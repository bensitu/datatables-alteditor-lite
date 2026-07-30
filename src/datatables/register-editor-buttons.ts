import { EDITOR_INTEGRATION_UPDATE_EVENT } from './editor-integration-event.js';

import type { EditorInstanceLookup } from '../instance/editor-instance-store.js';
import type { Api, DataTablesStatic } from 'datatables.net';

/** Stable DataTables Buttons names registered by AltEditorLite. */
export type EditorButtonName =
  | 'altEditorLiteCreate'
  | 'altEditorLiteEdit'
  | 'altEditorLiteRemove'
  | 'altEditorLiteRefresh';

/**
 * Enablement and accessible explanation for all optional editor buttons.
 */
export interface EditorButtonState {
  readonly create: {
    readonly enabled: boolean;
    readonly title: string;
  };
  readonly edit: {
    readonly enabled: boolean;
    readonly title: string;
  };
  readonly remove: {
    readonly enabled: boolean;
    readonly title: string;
  };
  readonly refresh: {
    readonly enabled: boolean;
    readonly title: string;
  };
}

/**
 * Inputs used to derive optional Buttons state without retaining an editor.
 */
export interface EditorButtonStateInput {
  /** Whether Create has a configured persistence owner. */
  readonly hasCreate: boolean;
  /** Whether Select extended the table API. */
  readonly hasSelect: boolean;
  /** Whether the editor accepts a new operation. */
  readonly isReady: boolean;
  /** Number of currently selected rows when Select is available. */
  readonly selectedRowCount: number;
}

/**
 * Derives enablement and accessible titles for all editor buttons.
 *
 * @param input - Current editor capabilities, state, and selection count.
 * @returns Complete immutable-by-contract button state.
 */
export function createEditorButtonState(
  input: Readonly<EditorButtonStateInput>,
): EditorButtonState {
  return {
    create: {
      enabled: input.isReady && input.hasCreate,
      title: !input.hasCreate
        ? 'Configure a Create operation to enable this action.'
        : input.isReady
          ? 'Create a row.'
          : 'The editor is busy.',
    },
    edit: {
      enabled: input.isReady && input.hasSelect && input.selectedRowCount === 1,
      title: !input.hasSelect
        ? 'DataTables Select is required for this button.'
        : input.selectedRowCount !== 1
          ? 'Select exactly one row to edit.'
          : input.isReady
            ? 'Edit the selected row.'
            : 'The editor is busy.',
    },
    refresh: {
      enabled: input.isReady,
      title: input.isReady ? 'Refresh the table.' : 'The editor is busy.',
    },
    remove: {
      enabled: input.isReady && input.hasSelect && input.selectedRowCount > 0,
      title: !input.hasSelect
        ? 'DataTables Select is required for this button.'
        : input.selectedRowCount === 0
          ? 'Select one or more rows to remove.'
          : input.isReady
            ? 'Remove the selected rows.'
            : 'The editor is busy.',
    },
  };
}

interface EditorButtonAccess {
  openCreateDialog(): Promise<void>;
  openEditDialog(): Promise<void>;
  openRemoveDialog(): Promise<void>;
  refreshTable(): Promise<void>;
  getIntegrationButtonState(): EditorButtonState;
}

interface ButtonController {
  enable(isEnabled: boolean): void;
}

interface ButtonNode {
  attr(name: string, value: string): unknown;
}

interface ButtonDefinition {
  readonly text: string;
  readonly titleAttr: string;
  readonly enabled: false;
  action(event: MouseEvent, table: Api<object>): void;
  init(
    this: ButtonController,
    table: Api<object>,
    buttonNode: ButtonNode,
    configuration: unknown,
  ): void;
  destroy(
    this: ButtonController,
    table: Api<object>,
    buttonNode: ButtonNode,
    configuration: unknown,
  ): void;
}

interface ButtonsCapableDataTable extends DataTablesStatic {
  readonly Buttons?: unknown;
  readonly ext: DataTablesStatic['ext'] & {
    readonly buttons: Record<string, unknown>;
  };
}

const cleanupByButton = new WeakMap<ButtonController, () => void>();

function findEditor(
  table: Api<object>,
  instanceLookups: ReadonlySet<EditorInstanceLookup>,
): EditorButtonAccess | null {
  const tableElement = table.table().node();
  for (const lookupInstance of instanceLookups) {
    const editor = lookupInstance(tableElement);
    if (editor !== null) {
      return editor as EditorButtonAccess;
    }
  }

  return null;
}

function invokeEditor(
  table: Api<object>,
  instanceLookups: ReadonlySet<EditorInstanceLookup>,
  operation: EditorButtonName,
): void {
  const editor = findEditor(table, instanceLookups);
  if (editor === null) {
    return;
  }

  let request: Promise<void>;
  switch (operation) {
    case 'altEditorLiteCreate':
      request = editor.openCreateDialog();
      break;
    case 'altEditorLiteEdit':
      request = editor.openEditDialog();
      break;
    case 'altEditorLiteRemove':
      request = editor.openRemoveDialog();
      break;
    case 'altEditorLiteRefresh':
      request = editor.refreshTable();
      break;
  }

  void request.catch(() => undefined);
}

function unavailableButtonState(): EditorButtonState {
  const unavailableTitle = 'Initialize AltEditorLite to use this action.';
  return {
    create: { enabled: false, title: unavailableTitle },
    edit: { enabled: false, title: unavailableTitle },
    refresh: { enabled: false, title: unavailableTitle },
    remove: { enabled: false, title: unavailableTitle },
  };
}

function selectButtonState(
  state: Readonly<EditorButtonState>,
  operation: EditorButtonName,
): Readonly<{ enabled: boolean; title: string }> {
  switch (operation) {
    case 'altEditorLiteCreate':
      return state.create;
    case 'altEditorLiteEdit':
      return state.edit;
    case 'altEditorLiteRemove':
      return state.remove;
    case 'altEditorLiteRefresh':
      return state.refresh;
  }
}

function createButtonDefinition(
  operation: EditorButtonName,
  text: string,
  instanceLookups: ReadonlySet<EditorInstanceLookup>,
): ButtonDefinition {
  return {
    action(_event: MouseEvent, table: Api<object>): void {
      invokeEditor(table, instanceLookups, operation);
    },
    destroy(this: ButtonController): void {
      cleanupByButton.get(this)?.();
      cleanupByButton.delete(this);
    },
    enabled: false,
    init(this: ButtonController, table: Api<object>, buttonNode: ButtonNode): void {
      const tableElement = table.table().node();
      const updateButton = (): void => {
        const editor = findEditor(table, instanceLookups);
        const buttonState = selectButtonState(
          editor?.getIntegrationButtonState() ?? unavailableButtonState(),
          operation,
        );
        this.enable(buttonState.enabled);
        buttonNode.attr('aria-disabled', String(!buttonState.enabled));
        buttonNode.attr('title', buttonState.title);
      };

      tableElement.addEventListener(EDITOR_INTEGRATION_UPDATE_EVENT, updateButton);
      cleanupByButton.set(this, () => {
        tableElement.removeEventListener(EDITOR_INTEGRATION_UPDATE_EVENT, updateButton);
      });
      updateButton();
    },
    text,
    titleAttr: text,
  };
}

/**
 * Registers optional Buttons definitions when Buttons has extended DataTables.
 *
 * The definitions resolve the current editor from the table element on every
 * action and update, so they never retain a destroyed or cross-bundle instance.
 *
 * @param dataTable - DataTables static runtime.
 * @param instanceLookups - Live cross-bundle instance lookup set.
 * @param registeredButtonNames - Shared idempotency record.
 */
export function registerEditorButtons(
  dataTable: DataTablesStatic,
  instanceLookups: ReadonlySet<EditorInstanceLookup>,
  registeredButtonNames: Set<EditorButtonName>,
): void {
  const buttonsDataTable = dataTable as ButtonsCapableDataTable;
  if (typeof buttonsDataTable.Buttons !== 'function') {
    return;
  }

  const definitions: Readonly<Record<EditorButtonName, Readonly<{ text: string }>>> = {
    altEditorLiteCreate: { text: 'Create' },
    altEditorLiteEdit: { text: 'Edit' },
    altEditorLiteRefresh: { text: 'Refresh' },
    altEditorLiteRemove: { text: 'Remove' },
  };

  for (const [buttonName, definition] of Object.entries(definitions) as [
    EditorButtonName,
    Readonly<{ text: string }>,
  ][]) {
    if (registeredButtonNames.has(buttonName)) {
      continue;
    }

    buttonsDataTable.ext.buttons[buttonName] = createButtonDefinition(
      buttonName,
      definition.text,
      instanceLookups,
    );
    registeredButtonNames.add(buttonName);
  }
}
