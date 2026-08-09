import { createInlineColumnMappings } from './inline-column-mapping.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { ResolvedInlineEditorOptions } from './inline-edit-options.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { Api } from 'datatables.net';

/** Rebuilds column mappings while preserving the map identity held by consumers. */
export class InlineColumnMappingRegistry<
  TRow extends object,
  TFormValues extends object,
> {
  public readonly mappings: ReadonlyMap<
    number,
    Readonly<InlineColumnMapping<TFormValues>>
  >;

  private readonly current = new Map<
    number,
    Readonly<InlineColumnMapping<TFormValues>>
  >();

  public constructor(
    private readonly table: Api<TRow>,
    private readonly fields: readonly FieldConfig<TFormValues>[],
    private readonly options: Readonly<ResolvedInlineEditorOptions<TFormValues>>,
  ) {
    this.mappings = this.current;
    this.rebuild();
  }

  public rebuild(): void {
    const next = createInlineColumnMappings(this.table, this.fields, this.options);
    this.current.clear();
    for (const [columnIndex, mapping] of next) {
      this.current.set(columnIndex, mapping);
    }
  }
}
