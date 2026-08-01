import type { FieldValidationResult } from './field-controller.js';
import type { MaybePromise } from './field-value.js';
import type { EditorValues } from '../core/editor-values.js';
import type { FieldPath } from '../object-path/field-path.js';

/**
 * Context supplied to field change callbacks.
 */
export interface FieldChangeContext<TFormValues extends object> {
  /** Latest values that could be collected from the form. */
  readonly values: Readonly<EditorValues<TFormValues>>;
  /** Signal aborted when the callback becomes stale or the field is destroyed. */
  readonly signal: AbortSignal;
}

/**
 * Context supplied to field validators.
 */
export interface FieldValidationContext<TFormValues extends object> {
  /** Values collected before field validators run. */
  readonly values: Readonly<EditorValues<TFormValues>>;
  /** Signal aborted when validation becomes stale or the form is destroyed. */
  readonly signal: AbortSignal;
}

/**
 * Callback invoked after a user changes a field.
 */
export type FieldChangeCallback<TFormValues extends object, TValue> = (
  value: TValue,
  context: FieldChangeContext<TFormValues>,
) => MaybePromise<void>;

/**
 * Custom validator invoked after native constraint validation succeeds.
 */
export type FieldValidator<TFormValues extends object, TValue> = (
  value: TValue,
  context: FieldValidationContext<TFormValues>,
) => MaybePromise<FieldValidationResult>;

/**
 * Configuration shared by all fields.
 */
export interface BaseFieldConfig<TFormValues extends object, TValue = unknown> {
  /** Safe dot-separated path in the form-value object. */
  readonly name: FieldPath<TFormValues>;
  /** Initial value used when a Create dialog opens. */
  readonly defaultValue?: TValue;
  /** Whether this field is created for an editing form. */
  readonly editable?: boolean;
  /** Whether this field occupies visible layout space. */
  readonly visible?: boolean;
  /** Whether the value is unavailable and omitted from collection. */
  readonly disabled?: boolean;
  /** Optional consumer class added to the field root. */
  readonly className?: string;
  /** Allowlisted native attributes applied to the primary control. */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Callback invoked when the user changes the value. */
  readonly onChange?: FieldChangeCallback<TFormValues, TValue>;
  /** Validator invoked after native constraint validation. */
  readonly validate?: FieldValidator<TFormValues, TValue>;
  /** Whether the normalized value must be distinct in currently loaded rows. */
  readonly unique?: boolean;
}

/**
 * Configuration shared by fields with a visible label.
 */
export interface VisibleFieldConfig<
  TFormValues extends object,
  TValue = unknown,
> extends BaseFieldConfig<TFormValues, TValue> {
  /** Visible field label. */
  readonly label: string;
  /** Supporting text associated with the control. */
  readonly description?: string;
  /** Whether the control must contain a value. */
  readonly required?: boolean;
  /** Whether the value is collected but cannot be changed. */
  readonly readonly?: boolean;
}

/**
 * Selectable string or number option.
 */
export interface SelectOption<TValue extends string | number = string | number> {
  /** Domain value represented by the option. */
  readonly value: TValue;
  /** Plain-text option label. */
  readonly label: string;
  /** Whether this option is unavailable. */
  readonly disabled?: boolean;
}

/** Text input configuration. */
export interface TextFieldConfig<TFormValues extends object> extends VisibleFieldConfig<
  TFormValues,
  string
> {
  readonly type: 'text';
  readonly trim?: boolean;
}

/** Email input configuration. */
export interface EmailFieldConfig<TFormValues extends object> extends VisibleFieldConfig<
  TFormValues,
  string
> {
  readonly type: 'email';
  readonly trim?: boolean;
}

/** Password input configuration. */
export interface PasswordFieldConfig<
  TFormValues extends object,
> extends VisibleFieldConfig<TFormValues, string> {
  readonly type: 'password';
  readonly trim?: boolean;
}

/** Date input configuration. */
export interface DateFieldConfig<TFormValues extends object> extends VisibleFieldConfig<
  TFormValues,
  string
> {
  readonly type: 'date';
}

/** Time input configuration. */
export interface TimeFieldConfig<TFormValues extends object> extends VisibleFieldConfig<
  TFormValues,
  string
> {
  readonly type: 'time';
}

/** Local date-time input configuration. */
export interface DateTimeFieldConfig<
  TFormValues extends object,
> extends VisibleFieldConfig<TFormValues, string> {
  readonly type: 'datetime-local';
}

/** Multiline text configuration. */
export interface TextareaFieldConfig<
  TFormValues extends object,
> extends VisibleFieldConfig<TFormValues, string> {
  readonly type: 'textarea';
  readonly rows?: number;
  readonly trim?: boolean;
}

/** Boolean checkbox configuration. */
export interface CheckboxFieldConfig<
  TFormValues extends object,
> extends VisibleFieldConfig<TFormValues, boolean> {
  readonly type: 'checkbox';
}

/**
 * Number input configuration.
 *
 * The default empty value is `undefined`.
 */
export type NumberFieldConfig<TFormValues extends object> =
  | (VisibleFieldConfig<TFormValues, number | undefined> & {
      readonly type: 'number';
      readonly emptyValue?: undefined;
    })
  | (VisibleFieldConfig<TFormValues, number | null> & {
      readonly type: 'number';
      readonly emptyValue: null;
    });

/** Radio-group configuration with typed option values. */
export interface RadioFieldConfig<
  TFormValues extends object,
  TValue extends string | number = string | number,
> extends VisibleFieldConfig<TFormValues, TValue | undefined> {
  readonly type: 'radio';
  readonly options: readonly SelectOption<TValue>[];
}

/** Native select configuration with typed option values. */
export interface SelectFieldConfig<
  TFormValues extends object,
  TValue extends string | number = string | number,
> extends VisibleFieldConfig<TFormValues, TValue | undefined> {
  readonly type: 'select';
  readonly options: readonly SelectOption<TValue>[];
  readonly allowClear?: boolean;
}

interface BaseSearchSelectFieldConfig<
  TFormValues extends object,
  TValue extends string | number,
> extends VisibleFieldConfig<TFormValues, TValue | undefined> {
  readonly type: 'search-select';
  /** Local options available to the single-value combobox. */
  readonly options: readonly SelectOption<TValue>[];
  /** Whether the current selection can be cleared. */
  readonly allowClear?: boolean;
  /** Whether matching options are sorted with the active locale. */
  readonly sortOptions?: boolean;
  /** Minimum query length before local filtering starts. */
  readonly searchThreshold?: number;
  /** Delay applied to local filtering after text input. */
  readonly debounceMs?: number;
}

/**
 * Local searchable single-select configuration.
 *
 * Manual values are intentionally limited to string-valued fields in 0.1.0.
 */
export type SearchSelectFieldConfig<
  TFormValues extends object,
  TValue extends string | number = string,
> = [TValue] extends [string]
  ? BaseSearchSelectFieldConfig<TFormValues, TValue> & {
      readonly allowManualValue?: boolean;
    }
  : BaseSearchSelectFieldConfig<TFormValues, TValue> & {
      readonly allowManualValue?: false;
    };

/** Hidden string value configuration. */
export interface HiddenFieldConfig<TFormValues extends object> extends BaseFieldConfig<
  TFormValues,
  string
> {
  readonly type: 'hidden';
  readonly label?: never;
  readonly visible?: false;
}

/** Encoding supported by a file field. */
export type FileEncoding = 'file' | 'data-url';

interface BaseFileProperties {
  readonly type: 'file';
  readonly accept?: string;
  readonly maxFileBytes?: number;
}

/**
 * Single-file configuration with an exact encoding-dependent value.
 */
export type SingleFileFieldConfig<TFormValues extends object> =
  | (VisibleFieldConfig<TFormValues, File | null> &
      BaseFileProperties & {
        readonly multiple?: false;
        readonly encoding?: 'file';
      })
  | (VisibleFieldConfig<TFormValues, string | null> &
      BaseFileProperties & {
        readonly multiple?: false;
        readonly encoding: 'data-url';
      });

/**
 * Multiple-file configuration with an exact encoding-dependent value.
 */
export type MultipleFileFieldConfig<TFormValues extends object> =
  | (VisibleFieldConfig<TFormValues, readonly File[]> &
      BaseFileProperties & {
        readonly multiple: true;
        readonly encoding?: 'file';
        readonly maxFileCount?: number;
      })
  | (VisibleFieldConfig<TFormValues, readonly string[]> &
      BaseFileProperties & {
        readonly multiple: true;
        readonly encoding: 'data-url';
        readonly maxFileCount?: number;
      });

/** Any supported file-field configuration. */
export type FileFieldConfig<TFormValues extends object> =
  SingleFileFieldConfig<TFormValues> | MultipleFileFieldConfig<TFormValues>;

/**
 * Discriminated union of currently supported fields.
 */
export type FieldConfig<TFormValues extends object> =
  | TextFieldConfig<TFormValues>
  | EmailFieldConfig<TFormValues>
  | PasswordFieldConfig<TFormValues>
  | NumberFieldConfig<TFormValues>
  | DateFieldConfig<TFormValues>
  | TimeFieldConfig<TFormValues>
  | DateTimeFieldConfig<TFormValues>
  | TextareaFieldConfig<TFormValues>
  | CheckboxFieldConfig<TFormValues>
  | RadioFieldConfig<TFormValues>
  | SelectFieldConfig<TFormValues>
  | SearchSelectFieldConfig<TFormValues>
  | SearchSelectFieldConfig<TFormValues, string | number>
  | SearchSelectFieldConfig<TFormValues, number>
  | FileFieldConfig<TFormValues>
  | HiddenFieldConfig<TFormValues>;
