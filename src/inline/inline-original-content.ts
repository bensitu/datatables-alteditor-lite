/** Preserves cell nodes only while the mounted view still owns the same cell. */
export class InlineOriginalContent {
  private readonly fragment = document.createDocumentFragment();

  private isSettled = false;

  private constructor(
    private readonly cell: HTMLTableCellElement,
    private readonly viewElement: HTMLElement,
    private readonly tableElement: HTMLTableElement,
  ) {
    while (cell.firstChild !== null) {
      this.fragment.append(cell.firstChild);
    }
  }

  public static capture(
    cell: HTMLTableCellElement,
    viewElement: HTMLElement,
    tableElement: HTMLTableElement,
  ): InlineOriginalContent {
    return new InlineOriginalContent(cell, viewElement, tableElement);
  }

  /** Restores captured nodes only when the original mounted relationship is intact. */
  public restore(): boolean {
    if (this.isSettled) {
      return false;
    }

    const canRestore =
      this.cell.isConnected &&
      this.cell.closest('table') === this.tableElement &&
      this.viewElement.isConnected &&
      this.viewElement.parentElement === this.cell;
    if (!canRestore) {
      this.discard();
      return false;
    }

    this.isSettled = true;
    this.cell.replaceChildren(this.fragment);
    return true;
  }

  /** Releases captured nodes without writing into a possibly stale cell. */
  public discard(): void {
    if (this.isSettled) {
      return;
    }
    this.isSettled = true;
    this.fragment.replaceChildren();
    this.viewElement.remove();
  }
}
