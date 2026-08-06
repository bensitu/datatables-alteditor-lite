import { resolveInlineActivationTarget } from './inline-activation.js';

import type { InlineActivationContext } from './inline-activation-context.js';
import type { InlineActivationStrategy } from './inline-activation-strategy.js';

/** Delegates double-click activation from eligible cells in the main table. */
export class InlineDoubleClickActivation<
  TRow extends object,
  TFormValues extends object,
> implements InlineActivationStrategy<TRow, TFormValues> {
  public attach(context: InlineActivationContext<TRow, TFormValues>): () => void {
    let isAttached = true;
    const handleDoubleClick = (event: MouseEvent): void => {
      if (context.signal.aborted) {
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
    const detach = (): void => {
      if (!isAttached) {
        return;
      }
      isAttached = false;
      context.tableElement.removeEventListener('dblclick', handleDoubleClick);
      context.signal.removeEventListener('abort', detach);
    };

    context.tableElement.addEventListener('dblclick', handleDoubleClick);
    context.signal.addEventListener('abort', detach, { once: true });
    if (context.signal.aborted) {
      detach();
    }
    return detach;
  }
}
