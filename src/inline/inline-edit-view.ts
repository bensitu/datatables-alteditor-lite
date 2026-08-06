/** User requests emitted by an inline editing view. */
export interface InlineEditViewHandlers {
  readonly onSubmit: () => void;
  readonly onCancel: (reason: 'cancel' | 'escape') => void;
}

/** Compact presentation mounted in one DataTables cell. */
export interface InlineEditView {
  readonly element: HTMLElement;
  mount(cell: HTMLTableCellElement): void;
  focus(): void;
  setBusy(isBusy: boolean): void;
  setInvalid(isInvalid: boolean): void;
  unmount(options: Readonly<{ restoreOriginalContent: boolean }>): void;
  destroy(): void;
}
