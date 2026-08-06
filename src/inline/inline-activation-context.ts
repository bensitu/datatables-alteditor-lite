import type { InlineActivationTarget } from './inline-activation.js';
import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { Api } from 'datatables.net';

/** Dependencies supplied to an inline activation strategy. */
export interface InlineActivationContext<
  TRow extends object,
  TFormValues extends object,
> {
  readonly table: Api<TRow>;
  readonly tableElement: HTMLTableElement;
  readonly mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>;
  readonly signal: AbortSignal;
  readonly onActivate: (target: Readonly<InlineActivationTarget>) => void;
}
