import {
  resolveInlineActivationTarget,
  resolveInlineCellTarget,
} from './inline-activation.js';

import type { InlineActivationContext } from './inline-activation-context.js';
import type { InlineActivationStrategy } from './inline-activation-strategy.js';
import type { InlineHoverTrigger } from './inline-hover-trigger.js';

const TOUCH_CLICK_FALLBACK_DELAY_MS = 400;

/** Presents one shared edit trigger for pointer, touch, and focused-cell discovery. */
export class InlineHoverActivation<
  TRow extends object,
  TFormValues extends object,
> implements InlineActivationStrategy<TRow, TFormValues> {
  private context: InlineActivationContext<TRow, TFormValues> | undefined;

  private isSuspended = false;

  private pendingTouchCell: HTMLTableCellElement | undefined;

  private touchFallbackTimer: number | undefined;

  public constructor(private readonly trigger: InlineHoverTrigger) {}

  public attach(context: InlineActivationContext<TRow, TFormValues>): () => void {
    this.context = context;
    let isAttached = true;

    const stopTriggerEvent = (event: Event): void => {
      event.stopPropagation();
    };
    const activateTrigger = (event: Event): void => {
      event.stopPropagation();
      if (this.isSuspended) {
        return;
      }
      const cell = this.trigger.currentCell();
      if (cell === undefined || context.signal.aborted) {
        return;
      }
      const target = resolveInlineCellTarget(
        context.table,
        context.tableElement,
        cell,
        context.mappings,
      );
      this.trigger.hide();
      if (target !== undefined) {
        context.onActivate(target);
      }
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (this.isSuspended || event.pointerType === 'touch' || context.signal.aborted) {
        return;
      }
      if (event.target instanceof Node && this.trigger.element.contains(event.target)) {
        return;
      }
      const target = resolveInlineActivationTarget(
        context.table,
        context.tableElement,
        event.target,
        context.mappings,
      );
      if (target === undefined) {
        if (!this.trigger.isFocused()) {
          this.trigger.hide();
        }
        return;
      }
      const cell = context.table.cell(target.rowIndex, target.columnIndex).node();
      if (cell instanceof HTMLTableCellElement) {
        this.trigger.moveTo(cell);
      }
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (this.isSuspended || event.pointerType !== 'touch' || context.signal.aborted) {
        return;
      }
      if (event.target instanceof Node && this.trigger.element.contains(event.target)) {
        return;
      }
      const target = resolveInlineActivationTarget(
        context.table,
        context.tableElement,
        event.target,
        context.mappings,
      );
      if (target === undefined) {
        this.trigger.hide();
        return;
      }
      const cell = context.table.cell(target.rowIndex, target.columnIndex).node();
      if (cell instanceof HTMLTableCellElement) {
        this.clearTouchFallback();
        this.pendingTouchCell = cell;
        this.touchFallbackTimer = window.setTimeout(() => {
          this.touchFallbackTimer = undefined;
          if (
            this.pendingTouchCell !== cell ||
            this.isSuspended ||
            context.signal.aborted ||
            resolveInlineCellTarget(
              context.table,
              context.tableElement,
              cell,
              context.mappings,
            ) === undefined
          ) {
            return;
          }
          this.trigger.moveTo(cell);
        }, TOUCH_CLICK_FALLBACK_DELAY_MS);
      }
    };
    const handleClick = (event: MouseEvent): void => {
      if (this.isSuspended) {
        this.clearTouchFallback();
        this.pendingTouchCell = undefined;
        return;
      }
      const cell = this.pendingTouchCell;
      if (cell === undefined) {
        return;
      }
      if (
        context.signal.aborted ||
        !(event.target instanceof Node) ||
        !cell.contains(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.clearTouchFallback();
        queueMicrotask(() => {
          if (
            this.pendingTouchCell !== cell ||
            this.isSuspended ||
            context.signal.aborted ||
            resolveInlineCellTarget(
              context.table,
              context.tableElement,
              cell,
              context.mappings,
            ) === undefined
          ) {
            return;
          }
          this.pendingTouchCell = undefined;
          this.trigger.moveTo(cell);
        });
        return;
      }
      this.clearTouchFallback();
      queueMicrotask(() => {
        if (
          this.pendingTouchCell !== cell ||
          this.isSuspended ||
          context.signal.aborted ||
          resolveInlineCellTarget(
            context.table,
            context.tableElement,
            cell,
            context.mappings,
          ) === undefined
        ) {
          return;
        }
        this.pendingTouchCell = undefined;
        this.trigger.moveTo(cell);
      });
    };
    const handlePointerLeave = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') {
        return;
      }
      if (!this.trigger.isFocused()) {
        this.trigger.hide();
      }
    };
    const handleDocumentPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') {
        return;
      }
      this.clearTouchFallback();
      this.pendingTouchCell = undefined;
      if (event.target instanceof Node && !context.tableElement.contains(event.target)) {
        this.trigger.hide();
      }
    };
    const handleStructuralChange = (): void => {
      this.clearTouchFallback();
      this.pendingTouchCell = undefined;
      this.trigger.hide();
    };
    const detach = (): void => {
      if (!isAttached) {
        return;
      }
      isAttached = false;
      this.clearTouchFallback();
      this.pendingTouchCell = undefined;
      this.context = undefined;
      this.trigger.element.removeEventListener('pointerdown', stopTriggerEvent);
      this.trigger.element.removeEventListener('click', activateTrigger);
      this.trigger.element.removeEventListener('dblclick', stopTriggerEvent);
      context.tableElement.removeEventListener('pointermove', handlePointerMove);
      context.tableElement.removeEventListener('pointerup', handlePointerUp);
      context.tableElement.removeEventListener('pointercancel', handleStructuralChange);
      context.tableElement.removeEventListener('pointerleave', handlePointerLeave);
      context.tableElement.removeEventListener('click', handleClick, true);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      context.table.off('.altEditorLiteInlineHover');
      context.signal.removeEventListener('abort', detach);
      this.trigger.destroy();
    };

    this.trigger.element.addEventListener('pointerdown', stopTriggerEvent);
    this.trigger.element.addEventListener('click', activateTrigger);
    this.trigger.element.addEventListener('dblclick', stopTriggerEvent);
    context.tableElement.addEventListener('pointermove', handlePointerMove);
    context.tableElement.addEventListener('pointerup', handlePointerUp);
    context.tableElement.addEventListener('pointercancel', handleStructuralChange);
    context.tableElement.addEventListener('pointerleave', handlePointerLeave);
    context.tableElement.addEventListener('click', handleClick, true);
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    context.table.on(
      'draw.altEditorLiteInlineHover column-reorder.altEditorLiteInlineHover responsive-resize.altEditorLiteInlineHover',
      handleStructuralChange,
    );
    context.signal.addEventListener('abort', detach, { once: true });
    if (context.signal.aborted) {
      detach();
    }
    return detach;
  }

  public hide(): void {
    this.clearTouchFallback();
    this.pendingTouchCell = undefined;
    this.trigger.hide();
  }

  public presentCell(cell: HTMLTableCellElement | undefined): void {
    this.clearTouchFallback();
    this.pendingTouchCell = undefined;
    const context = this.context;
    if (
      this.isSuspended ||
      cell === undefined ||
      context === undefined ||
      context.signal.aborted
    ) {
      this.trigger.hide();
      return;
    }
    const target = resolveInlineCellTarget(
      context.table,
      context.tableElement,
      cell,
      context.mappings,
    );
    if (target === undefined) {
      this.trigger.hide();
      return;
    }
    this.trigger.moveTo(cell);
  }

  public resume(): void {
    this.isSuspended = false;
  }

  public suspend(): void {
    this.isSuspended = true;
    this.hide();
  }

  private clearTouchFallback(): void {
    if (this.touchFallbackTimer === undefined) {
      return;
    }
    window.clearTimeout(this.touchFallbackTimer);
    this.touchFallbackTimer = undefined;
  }
}
