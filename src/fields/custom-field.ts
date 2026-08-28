import type {
  FieldChangeContext,
  FieldValidationContext,
  VisibleFieldConfig,
} from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { MaybePromise } from './field-value.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

declare const customFieldConfigMarker: unique symbol;

/** Compares two values using field-specific equality semantics. */
export type FieldValueComparator<TValue> = (left: TValue, right: TValue) => boolean;

/** Optional editing surfaces supported by a custom field implementation. */
export interface CustomFieldCapabilities {
  readonly batch?: boolean;
  readonly inline?: boolean;
}

/** Editing surface that owns a custom field controller instance. */
export type CustomFieldPresentation = 'dialog' | 'batch' | 'inline';

/** Stable editor services supplied while a custom field control is created. */
export interface CustomFieldControllerContext {
  /** Complete resolved language, including the canonical locale. */
  readonly language: Readonly<AltEditorLiteLanguage>;
  /** Editing surface that created this controller. */
  readonly presentation: CustomFieldPresentation;
  /** Signal aborted when the rendered field is cancelled or destroyed. */
  readonly signal: AbortSignal;
  /** Notification that the user changed the widget value. */
  readonly onUserChange: () => void;
}

/** Consumer-owned widget behavior mounted inside the editor-owned field shell. */
export interface CustomFieldAdapter<TValue> {
  /** Widget root mounted between the field label and error message. */
  readonly control: HTMLElement;
  /** Focusable control element that receives editor-owned accessibility relations. */
  readonly ariaTarget?: HTMLElement;
  getValue(): MaybePromise<TValue>;
  setValue(value: TValue): void;
  setDisabled(disabled: boolean): void;
  setReadOnly(readOnly: boolean): void;
  setRequired(required: boolean): void;
  focus(): void;
  validate?(signal: AbortSignal): MaybePromise<FieldValidationResult>;
  destroy(): void;
}

type CustomFieldOptionsValue<TOptions extends object | undefined> =
  TOptions extends object ? Readonly<TOptions> : undefined;

/** Runtime definition retained by each custom field configuration. */
export interface CustomFieldRuntimeDefinition<
  TValue,
  TOptions extends object | undefined = undefined,
> {
  readonly capabilities?: Readonly<CustomFieldCapabilities>;
  isEqual?(left: TValue, right: TValue): boolean;
  createController(
    options: CustomFieldOptionsValue<TOptions>,
    context: Readonly<CustomFieldControllerContext>,
  ): CustomFieldAdapter<TValue>;
}

/** Definition accepted by {@link defineCustomField}. */
export type CustomFieldDefinitionOptions<
  TValue,
  TOptions extends object | undefined = undefined,
> = CustomFieldRuntimeDefinition<TValue, TOptions>;

type CustomFieldOptionInput<TOptions extends object | undefined> = TOptions extends object
  ? { readonly options: Readonly<TOptions> }
  : { readonly options?: undefined };

type CustomVisibleFieldConfig<TFormValues extends object, TValue> = Omit<
  VisibleFieldConfig<TFormValues, TValue>,
  'attributes' | 'onChange' | 'validate'
> & {
  onChange?(value: TValue, context: FieldChangeContext<TFormValues>): MaybePromise<void>;
  validate?(
    value: TValue,
    context: FieldValidationContext<TFormValues>,
  ): MaybePromise<FieldValidationResult>;
};

/** Consumer input accepted by a typed custom field definition. */
export type CustomFieldConfigOptions<
  TFormValues extends object,
  TValue,
  TOptions extends object | undefined = undefined,
> = CustomVisibleFieldConfig<TFormValues, TValue> & CustomFieldOptionInput<TOptions>;

/** Custom field configuration created by a typed definition. */
export type CustomFieldConfig<
  TFormValues extends object,
  TValue = unknown,
  TOptions extends object | undefined = object | undefined,
> = CustomVisibleFieldConfig<TFormValues, TValue> & {
  readonly type: 'custom';
  readonly definition: Readonly<CustomFieldRuntimeDefinition<TValue, TOptions>>;
  readonly options?: CustomFieldOptionsValue<TOptions>;
  readonly [customFieldConfigMarker]: true;
};

/** Typed definition with a field builder that preserves form-path checking. */
export interface CustomFieldDefinition<
  TValue,
  TOptions extends object | undefined = undefined,
> extends CustomFieldRuntimeDefinition<TValue, TOptions> {
  field<TFormValues extends object>(
    config: CustomFieldConfigOptions<TFormValues, TValue, TOptions>,
  ): CustomFieldConfig<TFormValues, TValue, TOptions>;
}

/** Creates an explicit, type-safe custom field definition without global state. */
export function defineCustomField<
  TValue,
  TOptions extends object | undefined = undefined,
>(
  definition: CustomFieldDefinitionOptions<TValue, TOptions>,
): CustomFieldDefinition<TValue, TOptions> {
  return {
    ...definition,
    field: <TFormValues extends object>(
      config: CustomFieldConfigOptions<TFormValues, TValue, TOptions>,
    ) =>
      ({
        ...config,
        definition,
        type: 'custom',
      }) as CustomFieldConfig<TFormValues, TValue, TOptions>,
  };
}
