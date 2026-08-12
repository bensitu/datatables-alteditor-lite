import type { SelectOption } from './field-config.js';

/**
 * Public imperative surface for one rendered field.
 */
export interface FieldController<TValue> {
  /** Root element owned by the field. */
  readonly element: HTMLElement;
  /** Reads the normalized field value. */
  getValue(): Promise<TValue>;
  /** Replaces the displayed field value. */
  setValue(value: TValue): void;
  /** Returns whether the field currently occupies visible layout space. */
  isVisible(): boolean;
  /** Updates whether the field occupies visible layout space. */
  setVisible(isVisible: boolean): void;
  /** Returns whether the field is omitted from collection and validation. */
  isDisabled(): boolean;
  /** Updates the field's disabled state. */
  setDisabled(isDisabled: boolean): void;
  /** Returns whether the field is currently immutable. */
  isReadOnly(): boolean;
  /** Updates the field's immutable interaction state. */
  setReadOnly(isReadOnly: boolean): void;
  /** Returns whether the field currently requires a value. */
  isRequired(): boolean;
  /** Updates whether the field requires a value. */
  setRequired(isRequired: boolean): void;
  /** Moves keyboard focus to the primary control. */
  focus(): void;
  /** Runs native and configured validation. */
  validate(): Promise<FieldValidationResult>;
  /** Removes the displayed validation error. */
  clearError(): void;
  /** Displays a field-level validation error. */
  showError(message: string): void;
  /** Removes owned listeners and DOM. */
  destroy(): void;
}

/** Public controller for Select, Radio, and SearchSelect fields. */
export interface ChoiceFieldController<
  TValue extends string | number,
> extends FieldController<TValue | undefined> {
  getOptions(): readonly SelectOption<TValue>[];
  setOptions(options: readonly SelectOption<TValue>[]): void;
}

/** Narrows a rendered field controller to the shared choice option API. */
export function isChoiceFieldController<TValue>(
  controller: FieldController<TValue>,
): controller is FieldController<TValue> &
  ChoiceFieldController<Extract<NonNullable<TValue>, string | number>> {
  const candidate = controller as Partial<ChoiceFieldController<string | number>>;
  return (
    typeof candidate.getOptions === 'function' &&
    typeof candidate.setOptions === 'function'
  );
}

/**
 * Result returned by a field validator.
 */
export interface FieldValidationResult {
  /** Whether the value passed validation. */
  readonly valid: boolean;
  /** User-facing error text when validation failed. */
  readonly message?: string;
}
