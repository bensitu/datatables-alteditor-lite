import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { Api } from 'datatables.net';

/** Row and column resolved from a delegated inline activation event. */
export interface InlineActivationTarget {
  readonly columnIndex: number;
  readonly rowIndex: number;
}

function isInteractiveDescendant(target: Element): boolean {
  return (
    target.closest(
      'a, button, input, select, textarea, [contenteditable], [data-alteditor-lite-ignore-inline], [data-alteditor-lite-inline]',
    ) !== null
  );
}

/** Resolves an eligible main-table cell from a delegated event target. */
export function resolveInlineActivationTarget<
  TRow extends object,
  TFormValues extends object,
>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  target: EventTarget | null,
  mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
): Readonly<InlineActivationTarget> | undefined {
  if (!(target instanceof Element) || isInteractiveDescendant(target)) {
    return undefined;
  }

  const cellNode = target.closest<HTMLTableCellElement>('tbody td, tbody th');
  if (cellNode?.closest('table') !== tableElement) {
    return undefined;
  }

  const cellIndex = table.cell(cellNode).index() as
    { readonly column?: number; readonly row?: number } | undefined;
  if (
    typeof cellIndex?.row !== 'number' ||
    typeof cellIndex.column !== 'number' ||
    !mappings.has(cellIndex.column)
  ) {
    return undefined;
  }

  return Object.freeze({
    columnIndex: cellIndex.column,
    rowIndex: cellIndex.row,
  });
}
