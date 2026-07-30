import type { MaybePromise } from './field-value.js';

/**
 * Public imperative surface for one rendered field.
 */
export interface FieldController<TValue> {
  /** Root element owned by the field. */
  readonly element: HTMLElement;
  /** Reads the normalized field value. */
  getValue(): MaybePromise<TValue>;
  /** Replaces the displayed field value. */
  setValue(value: TValue): void;
  /** Updates the field's disabled state. */
  setDisabled(isDisabled: boolean): void;
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

/**
 * Result returned by a field validator.
 */
export interface FieldValidationResult {
  /** Whether the value passed validation. */
  readonly valid: boolean;
  /** User-facing error text when validation failed. */
  readonly message?: string;
}
