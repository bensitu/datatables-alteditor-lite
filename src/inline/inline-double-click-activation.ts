import {
  resolveInlineActivationTarget,
  type InlineActivationTarget,
} from './inline-activation.js';

import type { InlineActivationContext } from './inline-activation-context.js';
import type { InlineActivationStrategy } from './inline-activation-strategy.js';

const TOUCH_DOUBLE_TAP_DELAY_MS = 500;

/** Delegates double-click and double-tap activation from eligible table cells. */
export class InlineDoubleClickActivation<
  TRow extends object,
  TFormValues extends object,
> implements InlineActivationStrategy<TRow, TFormValues> {
  public attach(context: InlineActivationContext<TRow, TFormValues>): () => void {
    let isAttached = true;
    let pendingTouchCell: HTMLTableCellElement | undefined;
    let pendingTouchPointerId: number | undefined;
    let previousTouchCell: HTMLTableCellElement | undefined;
    let previousTouchTime = 0;

    const clearTouchState = (): void => {
      pendingTouchCell = undefined;
      pendingTouchPointerId = undefined;
      previousTouchCell = undefined;
      previousTouchTime = 0;
    };
    const resolveTouchCell = (
      eventTarget: EventTarget | null,
    ):
      | {
          readonly cell: HTMLTableCellElement;
          readonly target: Readonly<InlineActivationTarget>;
        }
      | undefined => {
      const target = resolveInlineActivationTarget(
        context.table,
        context.tableElement,
        eventTarget,
        context.mappings,
      );
      if (target === undefined) {
        return undefined;
      }
      const cell = context.table.cell(target.rowIndex, target.columnIndex).node();
      return cell instanceof HTMLTableCellElement ? { cell, target } : undefined;
    };
    const handleDoubleClick = (event: MouseEvent): void => {
      if (context.signal.aborted || event.button !== 0 || event.detail < 2) {
        return;
      }
      const target = resolveInlineActivationTarget(
        context.table,
        context.tableElement,
        event.target,
        context.mappings,
      );
      if (target !== undefined) {
        context.onActivate(target);
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (context.signal.aborted || event.pointerType !== 'touch' || !event.isPrimary) {
        return;
      }
      const resolved = resolveTouchCell(event.target);
      const now = performance.now();
      if (
        resolved !== undefined &&
        previousTouchCell === resolved.cell &&
        now - previousTouchTime <= TOUCH_DOUBLE_TAP_DELAY_MS
      ) {
        pendingTouchCell = resolved.cell;
        pendingTouchPointerId = event.pointerId;
        event.preventDefault();
        return;
      }
      clearTouchState();
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (context.signal.aborted || event.pointerType !== 'touch' || !event.isPrimary) {
        return;
      }
      const resolved = resolveTouchCell(event.target);
      if (pendingTouchPointerId === event.pointerId) {
        const shouldActivate =
          resolved !== undefined && resolved.cell === pendingTouchCell;
        event.preventDefault();
        clearTouchState();
        if (shouldActivate) {
          context.onActivate(resolved.target);
        }
        return;
      }
      if (resolved === undefined) {
        clearTouchState();
        return;
      }
      previousTouchCell = resolved.cell;
      previousTouchTime = performance.now();
    };
    const detach = (): void => {
      if (!isAttached) {
        return;
      }
      isAttached = false;
      clearTouchState();
      context.tableElement.removeEventListener('dblclick', handleDoubleClick);
      context.tableElement.removeEventListener('pointerdown', handlePointerDown);
      context.tableElement.removeEventListener('pointerup', handlePointerUp);
      context.tableElement.removeEventListener('pointercancel', clearTouchState);
      context.signal.removeEventListener('abort', detach);
    };

    context.tableElement.addEventListener('dblclick', handleDoubleClick);
    context.tableElement.addEventListener('pointerdown', handlePointerDown);
    context.tableElement.addEventListener('pointerup', handlePointerUp);
    context.tableElement.addEventListener('pointercancel', clearTouchState);
    context.signal.addEventListener('abort', detach, { once: true });
    if (context.signal.aborted) {
      detach();
    }
    return detach;
  }
}
