import type { EditorValues } from '../core/editor-values.js';
import type { SelectOption } from '../fields/field-config.js';
import type { MaybePromise } from '../fields/field-value.js';
import type { FieldPath, FieldPathValue } from '../object-path/field-path.js';

/** Immutable values and cancellation state supplied to a dependency resolver. */
export interface FormDependencyContext<TFormValues extends object> {
  readonly values: Readonly<EditorValues<TFormValues>>;
  readonly signal: AbortSignal;
}

/** Option values accepted by a dependency patch for one field path. */
export type ChoicePatchOptions<TValue> =
  Extract<NonNullable<TValue>, string | number> extends never
    ? readonly SelectOption[]
    : readonly SelectOption<Extract<NonNullable<TValue>, string | number>>[];

/** Declarative state changes available for one configured field path. */
export interface FieldStatePatchFor<
  TFormValues extends object,
  TPath extends FieldPath<TFormValues>,
> {
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly value?: FieldPathValue<TFormValues, TPath>;
  readonly options?: ChoicePatchOptions<FieldPathValue<TFormValues, TPath>>;
}

/** Field patches returned by one dependency resolver. */
export type FormDependencyResult<TFormValues extends object> = Partial<{
  [TPath in FieldPath<TFormValues>]: FieldStatePatchFor<TFormValues, TPath>;
}>;

/** Resolver associated with one source field path. */
export type FormDependencyResolver<
  TFormValues extends object,
  TSourcePath extends FieldPath<TFormValues>,
> = (
  value: FieldPathValue<TFormValues, TSourcePath>,
  context: FormDependencyContext<TFormValues>,
) => MaybePromise<FormDependencyResult<TFormValues>>;

/** Source-path mapping for declarative dialog field dependencies. */
export type FormDependencies<TFormValues extends object> = Partial<{
  [TSourcePath in FieldPath<TFormValues>]: FormDependencyResolver<
    TFormValues,
    TSourcePath
  >;
}>;

/** Preserves contextual source-path inference for a dependency mapping. */
export function defineFormDependencies<TFormValues extends object>() {
  return <TDependencies extends FormDependencies<TFormValues>>(
    dependencies: TDependencies,
  ): TDependencies => dependencies;
}
