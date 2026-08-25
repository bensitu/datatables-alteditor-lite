import { ENGLISH_LANGUAGE } from '../core/alt-editor-lite-language.js';

import { EDITOR_INTEGRATION_UPDATE_EVENT } from './editor-integration-event.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
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
  readonly unavailableTitle: string;
  readonly create: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly text: string;
    readonly title: string;
  };
  readonly edit: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly text: string;
    readonly title: string;
  };
  readonly remove: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly text: string;
    readonly title: string;
  };
  readonly refresh: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly text: string;
    readonly title: string;
  };
}

/**
 * Inputs used to derive optional Buttons state without retaining an editor.
 */
export interface EditorButtonStateInput {
  /** Features available for the configured edit presentation. */
  readonly capabilities: Readonly<EditorCapabilities>;
  /** Whether Create has a configured persistence owner. */
  readonly hasCreate: boolean;
  /** Whether Select extended the table API. */
  readonly hasSelect: boolean;
  /** Whether the editor accepts a new operation. */
  readonly isReady: boolean;
  /** Number of currently selected rows when Select is available. */
  readonly selectedRowCount: number;
  /** Resolved language for the owning editor instance. */
  readonly language: Readonly<AltEditorLiteLanguage>;
}

/**
 * Derives enablement and accessible titles for all editor buttons.
 *
 * @param input - Current editor capabilities, state, and selection count.
 * @returns Complete readonly button state.
 */
export function createEditorButtonState(
  input: Readonly<EditorButtonStateInput>,
): EditorButtonState {
  const { language } = input;
  const hasSingleSelection = input.selectedRowCount === 1;
  const hasMultipleSelection = input.selectedRowCount >= 2;
  const canEditSelection =
    (hasSingleSelection && input.capabilities.editDialog) ||
    (hasMultipleSelection && input.capabilities.batchEditDialog);
  return {
    unavailableTitle: language.buttons.initialize,
    create: {
      visible: input.capabilities.createDialog,
      enabled: input.capabilities.createDialog && input.isReady && input.hasCreate,
      text: language.actions.create,
      title: !input.hasCreate
        ? language.buttons.createUnavailable
        : input.isReady
          ? language.dialog.createTitle
          : language.buttons.busy,
    },
    edit: {
      visible: input.capabilities.editDialog || input.capabilities.batchEditDialog,
      enabled: input.isReady && input.hasSelect && canEditSelection,
      text: language.actions.edit,
      title: !input.hasSelect
        ? language.buttons.selectUnavailable
        : input.selectedRowCount === 0 || !canEditSelection
          ? input.selectedRowCount >= 2
            ? language.buttons.batchEditUnavailable
            : language.buttons.editSelection
          : input.isReady
            ? hasMultipleSelection
              ? language.dialog.batchEditTitle
              : language.dialog.editTitle
            : language.buttons.busy,
    },
    refresh: {
      visible: input.capabilities.refresh,
      enabled: input.capabilities.refresh && input.isReady,
      text: language.actions.refresh,
      title: input.isReady ? language.actions.refresh : language.buttons.busy,
    },
    remove: {
      visible: input.capabilities.removeDialog,
      enabled:
        input.capabilities.removeDialog &&
        input.isReady &&
        input.hasSelect &&
        input.selectedRowCount > 0,
      text: language.actions.remove,
      title: !input.hasSelect
        ? language.buttons.selectUnavailable
        : input.selectedRowCount === 0
          ? language.buttons.removeSelection
          : input.isReady
            ? language.dialog.removeTitle
            : language.buttons.busy,
    },
  };
}

interface EditorButtonAccess {
  openCreateDialog(): Promise<void>;
  openEditDialog(): Promise<void>;
  openBatchEditDialog(): Promise<void>;
  openRemoveDialog(): Promise<void>;
  refresh(): Promise<void>;
  getIntegrationButtonStateInput(): EditorButtonStateInput;
}

interface ButtonController {
  enable(isEnabled: boolean): void;
  text(value: string): void;
}

interface ButtonNode {
  attr(name: string, value?: string): unknown;
  attrRemove(name: string): unknown;
  css(name: string, value: string): unknown;
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
      request =
        editor.getIntegrationButtonStateInput().selectedRowCount >= 2
          ? editor.openBatchEditDialog()
          : editor.openEditDialog();
      break;
    case 'altEditorLiteRemove':
      request = editor.openRemoveDialog();
      break;
    case 'altEditorLiteRefresh':
      request = editor.refresh();
      break;
  }

  // Invalid actions are disabled before invocation, while operation failures are
  // presented by the editor and published through its error event. Observing the
  // terminal promise prevents a void DataTables Buttons callback from creating an
  // unhandled rejection after that reporting has already completed.
  void request.catch(() => undefined);
}

function unavailableButtonState(
  previousState?: Readonly<EditorButtonState>,
): EditorButtonState {
  const fallbackState =
    previousState ??
    createEditorButtonState({
      capabilities: {
        batchEditDialog: false,
        createDialog: true,
        editDialog: false,
        inlineEdit: false,
        refresh: true,
        removeDialog: true,
      },
      hasCreate: false,
      hasSelect: false,
      isReady: false,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 0,
    });
  const unavailableTitle = fallbackState.unavailableTitle;
  return {
    unavailableTitle,
    create: { ...fallbackState.create, enabled: false, title: unavailableTitle },
    edit: { ...fallbackState.edit, enabled: false, title: unavailableTitle },
    refresh: { ...fallbackState.refresh, enabled: false, title: unavailableTitle },
    remove: { ...fallbackState.remove, enabled: false, title: unavailableTitle },
  };
}

function selectButtonState(
  state: Readonly<EditorButtonState>,
  operation: EditorButtonName,
): Readonly<{ enabled: boolean; visible: boolean; text: string; title: string }> {
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
      cleanupByButton.get(this)?.();
      const tableElement = table.table().node();
      const initialTabIndexValue = buttonNode.attr('tabindex');
      const initialTabIndex =
        typeof initialTabIndexValue === 'string' ? initialTabIndexValue : undefined;
      let currentState = unavailableButtonState();
      const updateButton = (): void => {
        const editor = findEditor(table, instanceLookups);
        currentState =
          editor === null
            ? unavailableButtonState(currentState)
            : createEditorButtonState(editor.getIntegrationButtonStateInput());
        const buttonState = selectButtonState(currentState, operation);
        this.enable(buttonState.enabled);
        this.text(buttonState.text);
        buttonNode.css('display', buttonState.visible ? '' : 'none');
        buttonNode.attr('aria-hidden', String(!buttonState.visible));
        buttonNode.attr('aria-disabled', String(!buttonState.enabled));
        buttonNode.attr('title', buttonState.title);
        if (buttonState.visible) {
          if (initialTabIndex === undefined) {
            buttonNode.attrRemove('tabindex');
          } else {
            buttonNode.attr('tabindex', initialTabIndex);
          }
        } else {
          buttonNode.attr('tabindex', '-1');
        }
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
