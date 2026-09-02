import { resolveInlineCellTarget } from '../inline/inline-activation.js';
import { matchesInlineKeyboardShortcut } from '../inline/inline-keyboard-shortcut.js';

import type { InlineActivationTarget } from '../inline/inline-activation.js';
import type { InlineColumnMapping } from '../inline/inline-column-mapping.js';
import type {
  InlineKeyboardActivation,
  InlineKeyboardShortcut,
} from '../inline/inline-keyboard-shortcut.js';
import type { Api } from 'datatables.net';

export type KeyTableEnabledState = true | false | 'navigation-only' | 'tab-only';

interface KeyTableApiSurface {
  readonly disable: () => unknown;
  readonly enable: (state?: true | 'navigation-only' | 'tab-only') => unknown;
  readonly enabled: () => unknown;
}

interface KeyTableOwner {
  readonly keys?: Partial<KeyTableApiSurface>;
}

interface CellApiSurface {
  readonly index: () => { readonly column?: number; readonly row?: number } | undefined;
  readonly node: () => unknown;
}

/** Narrows the exact KeyTable state that can be restored after editing. */
export function normalizeKeyTableEnabledState(
  value: unknown,
): KeyTableEnabledState | undefined {
  return value === true ||
    value === false ||
    value === 'navigation-only' ||
    value === 'tab-only'
    ? value
    : undefined;
}

function resolveKeysApi(table: object): KeyTableApiSurface | undefined {
  const keys = (table as KeyTableOwner).keys;
  return typeof keys?.enabled === 'function' &&
    typeof keys.enable === 'function' &&
    typeof keys.disable === 'function'
    ? (keys as KeyTableApiSurface)
    : undefined;
}

function isCellApiSurface(value: unknown): value is CellApiSurface {
  return (
    typeof value === 'object' &&
    value !== null &&
    'index' in value &&
    typeof value.index === 'function' &&
    'node' in value &&
    typeof value.node === 'function'
  );
}

function isShortcutList(
  value: Exclude<InlineKeyboardActivation, false>,
): value is readonly Readonly<InlineKeyboardShortcut>[] {
  return Array.isArray(value);
}

/** Tracks KeyTable focus and owns the configured native activation shortcut. */
export class KeyTableInlineIntegration<TRow extends object, TFormValues extends object> {
  private readonly keys: KeyTableApiSurface | undefined;

  private focusedCell: HTMLTableCellElement | undefined;

  private previousState: KeyTableEnabledState | undefined;

  private isAttached = false;

  public constructor(
    private readonly table: Api<TRow>,
    private readonly tableElement: HTMLTableElement,
    private readonly mappings: ReadonlyMap<
      number,
      Readonly<InlineColumnMapping<TFormValues>>
    >,
    private readonly shortcut: InlineKeyboardActivation,
    private readonly onActivate: (target: Readonly<InlineActivationTarget>) => void,
    private readonly onFocusCell: (cell: HTMLTableCellElement | undefined) => void,
  ) {
    this.keys = resolveKeysApi(table);
  }

  public attach(): void {
    if (this.keys === undefined || this.isAttached) {
      return;
    }
    this.isAttached = true;
    this.table.on(
      'key-focus.altEditorLiteInlineKeyboard key-refocus.altEditorLiteInlineKeyboard',
      this.handleKeyFocus,
    );
    this.table.on('key-blur.altEditorLiteInlineKeyboard', this.handleKeyBlur);
  }

  public suspend(): void {
    if (this.keys === undefined || this.previousState !== undefined) {
      return;
    }
    const state = normalizeKeyTableEnabledState(this.keys.enabled());
    if (state === undefined) {
      return;
    }
    this.previousState = state;
    this.detachKeyListener();
    this.keys.disable();
  }

  public restore(): void {
    const state = this.previousState;
    this.previousState = undefined;
    if (this.keys === undefined || state === undefined) {
      return;
    }
    if (normalizeKeyTableEnabledState(this.keys.enabled()) !== false) {
      return;
    }
    if (state === false) {
      this.keys.disable();
    } else {
      this.keys.enable(state);
      if (this.isAttached && this.focusedCell !== undefined) {
        this.attachKeyListener();
      }
    }
  }

  public refreshFocusedCell(): void {
    this.onFocusCell(this.focusedCell);
  }

  public destroy(): void {
    if (!this.isAttached) {
      this.restore();
      return;
    }
    this.isAttached = false;
    this.restore();
    this.table.off('.altEditorLiteInlineKeyboard');
    this.detachKeyListener();
    this.focusedCell = undefined;
  }

  private readonly handleKeyFocus = (...eventArguments: unknown[]): void => {
    const cellApi = eventArguments.find(isCellApiSurface);
    const cell = cellApi?.node();
    this.focusedCell =
      cell instanceof HTMLTableCellElement && cell.closest('table') === this.tableElement
        ? cell
        : undefined;
    if (this.focusedCell === undefined) {
      this.detachKeyListener();
    } else {
      this.attachKeyListener();
    }
    this.onFocusCell(this.focusedCell);
  };

  private readonly handleKeyBlur = (): void => {
    this.detachKeyListener();
    this.focusedCell = undefined;
    this.onFocusCell(undefined);
  };

  private attachKeyListener(): void {
    if (this.shortcut !== false) {
      document.addEventListener('keydown', this.handleKeyDown, true);
    }
  }

  private detachKeyListener(): void {
    if (this.shortcut !== false) {
      document.removeEventListener('keydown', this.handleKeyDown, true);
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const cell = this.focusedCell;
    if (
      this.shortcut === false ||
      cell === undefined ||
      cell.classList.contains('alteditor-lite-cell--editing') ||
      !this.matchesShortcut(event)
    ) {
      return;
    }
    const target = resolveInlineCellTarget(
      this.table,
      this.tableElement,
      cell,
      this.mappings,
    );
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.onActivate(target);
  };

  private matchesShortcut(event: KeyboardEvent): boolean {
    const shortcut = this.shortcut;
    if (shortcut === false) {
      return false;
    }
    return isShortcutList(shortcut)
      ? shortcut.some((candidate) => matchesInlineKeyboardShortcut(event, candidate))
      : matchesInlineKeyboardShortcut(event, shortcut);
  }
}
