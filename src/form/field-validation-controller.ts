import { mergeAbortSignals } from '../core/merge-abort-signals.js';

import type { FieldValidationTrigger } from '../fields/field-config.js';
import type { FieldValidationResult } from '../fields/field-controller.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

interface FieldValidationState<TFormValues extends object> {
  readonly controller: ManagedFieldController<TFormValues>;
  readonly validate: (signal: AbortSignal) => Promise<FieldValidationResult>;
  readonly listener: EventListener;
  request: AbortController | undefined;
  eagerError: boolean;
}

/** Owns cancellable field validation and focus boundaries for dialog forms. */
export class FieldValidationController<TFormValues extends object> {
  private readonly fields = new Map<string, FieldValidationState<TFormValues>>();

  private suspensionCount = 0;

  public constructor(
    private readonly form: HTMLFormElement,
    private readonly lifecycleSignal: AbortSignal,
    private readonly invalidMessage: string,
  ) {}

  public register(
    controller: ManagedFieldController<TFormValues>,
    trigger: FieldValidationTrigger | undefined,
    validate: (signal: AbortSignal) => Promise<FieldValidationResult>,
    isEligible: () => boolean = () => true,
  ): void {
    const listener: EventListener = (event) => {
      if (
        !(event instanceof FocusEvent) ||
        this.form.inert ||
        this.suspensionCount > 0 ||
        controller.isDisabled() ||
        !isEligible()
      ) {
        return;
      }
      const target = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (
        controller.containsFocusTarget?.(target) ??
        (target !== null && controller.element.contains(target))
      ) {
        return;
      }
      void this.validate(controller.name, 'eager').catch(() => undefined);
    };
    this.fields.set(controller.name, {
      controller,
      eagerError: false,
      listener,
      request: undefined,
      validate,
    });
    if (trigger === 'blur') {
      controller.element.addEventListener('focusout', listener);
    }
  }

  public forgetError(name: string): void {
    const field = this.fields.get(name);
    if (field !== undefined) {
      field.eagerError = false;
    }
  }

  public invalidate(name: string, clearEagerError = false): void {
    const field = this.fields.get(name);
    if (field === undefined) {
      return;
    }
    field.request?.abort();
    field.request = undefined;
    this.setValidating(field, false);
    if (clearEagerError && field.eagerError) {
      field.eagerError = false;
      field.controller.clearError();
    }
  }

  /** Temporarily prevents eager validation while a full-form request is active. */
  public suspend(): () => void {
    this.suspensionCount += 1;
    for (const name of this.fields.keys()) {
      this.invalidate(name);
    }
    return () => {
      this.suspensionCount -= 1;
    };
  }

  public remove(name: string): void {
    const field = this.fields.get(name);
    if (field !== undefined) {
      this.invalidate(name);
      field.controller.element.removeEventListener('focusout', field.listener);
      this.fields.delete(name);
    }
  }

  public destroy(): void {
    for (const name of this.fields.keys()) {
      this.remove(name);
    }
  }

  public async validate(
    name: string,
    source: 'eager' | 'manual',
  ): Promise<FieldValidationResult> {
    const field = this.fields.get(name);
    if (field === undefined) {
      return { valid: false };
    }
    this.invalidate(name, source === 'eager');
    const request = new AbortController();
    field.request = request;
    const merged = mergeAbortSignals([request.signal, this.lifecycleSignal]);
    const isCurrent = (): boolean => !merged.signal.aborted && field.request === request;
    const showError = (message: string): void => {
      field.controller.showError(message);
      field.eagerError = source === 'eager';
    };
    if (source === 'manual') {
      field.eagerError = false;
      field.controller.clearError();
    } else {
      this.setValidating(field, true);
    }
    try {
      const result = await field.validate(merged.signal);
      if (!isCurrent()) {
        return { valid: false };
      }
      if (!result.valid) {
        showError(result.message ?? this.invalidMessage);
      }
      return result;
    } catch (error: unknown) {
      if (!isCurrent()) {
        return { valid: false };
      }
      showError(this.invalidMessage);
      throw error instanceof Error
        ? error
        : new Error('Field validation failed with a non-Error value.', { cause: error });
    } finally {
      merged.dispose();
      if (field.request === request) {
        field.request = undefined;
        this.setValidating(field, false);
      }
    }
  }

  private setValidating(field: FieldValidationState<TFormValues>, active: boolean): void {
    field.controller.element.classList.toggle('alteditor-lite-field--validating', active);
    if (active) {
      field.controller.element.setAttribute('aria-busy', 'true');
    } else {
      field.controller.element.removeAttribute('aria-busy');
    }
  }
}
