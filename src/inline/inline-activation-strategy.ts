import type { InlineActivationContext } from './inline-activation-context.js';

/** Attaches one user gesture that can request inline activation. */
export interface InlineActivationStrategy<
  TRow extends object,
  TFormValues extends object,
> {
  attach(context: InlineActivationContext<TRow, TFormValues>): () => void;
}
