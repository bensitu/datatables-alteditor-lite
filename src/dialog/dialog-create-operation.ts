import {
  type AltEditorLiteError,
  EditorConfigurationError,
} from '../core/alt-editor-lite-error.js';
import { assertCompleteRow, isPromiseLike } from '../core/complete-row-result.js';
import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../core/error-normalization.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type {
  OperationOwner,
  OwnedOperationRequest,
} from '../core/editing/operation-owner.js';
import type { EditorErrorReporter } from '../core/editor-error-reporter.js';
import type { EditorValues } from '../core/editor-values.js';
import type { EditorFormController } from '../form/form-controller.js';
import type { EditorHost } from '../host/editor-host.js';

export interface DialogCreatePresentation<TFormValues extends object> {
  startSubmission(): void;
  restoreAfterValidation(form: EditorFormController<TFormValues>): void;
  restoreAfterAbort(form: EditorFormController<TFormValues>): void;
  showOperationError(
    form: EditorFormController<TFormValues>,
    error: AltEditorLiteError,
  ): void;
  completeSuccess(form: EditorFormController<TFormValues>): void;
}

export interface DialogCreateOperationArguments<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly host: EditorHost<TRow, TTarget>;
  readonly eventTarget: EventTarget;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly operationOwner: OperationOwner;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly onPresentationComplete: () => void;
}

/** Validates, persists, and commits one dialog Create operation. */
export class DialogCreateOperation<
  TRow extends object,
  TFormValues extends object,
  TTarget,
> {
  public constructor(
    private readonly arguments_: DialogCreateOperationArguments<
      TRow,
      TFormValues,
      TTarget
    >,
  ) {}

  /** Runs one Create submission while the supplied form remains active. */
  public async run(
    form: EditorFormController<TFormValues>,
    presentation: DialogCreatePresentation<TFormValues>,
  ): Promise<void> {
    presentation.startSubmission();
    const request = this.arguments_.operationOwner.begin('create', 'dialog');
    let phase: EditorErrorHookContext['phase'] = 'validation';

    try {
      const validationResult = await form.validateForSubmission(
        request.abortController.signal,
        this.arguments_.options.validateForm,
        {
          mode: 'dialog',
          operation: 'create',
        },
      );
      if (!this.owns(request)) {
        return;
      }
      if (!validationResult.valid) {
        this.arguments_.operationOwner.complete(request);
        presentation.restoreAfterValidation(form);
        return;
      }

      const values = validationResult.values;

      phase = 'submit';
      const beforeSubmit = this.arguments_.options.hooks?.beforeSubmit;
      if (beforeSubmit !== undefined) {
        const shouldContinue = await Promise.resolve(
          beforeSubmit(values, this.arguments_.operationOwner.context(request)),
        );
        if (!this.owns(request)) {
          return;
        }
        if (shouldContinue === false) {
          this.arguments_.operationOwner.complete(request);
          presentation.restoreAfterValidation(form);
          return;
        }
      }

      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
        this.arguments_.eventTarget,
        'alteditor-lite:submit',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'create',
          type: 'submit',
          values,
        },
      );
      if (!this.owns(request)) {
        return;
      }

      phase = 'persistence';
      const row = await this.createRow(values, request);
      if (!this.owns(request)) {
        return;
      }

      phase = 'commit';
      await this.arguments_.host.applyCreate(row, {
        mode: 'dialog',
        operation: 'create',
        signal: request.abortController.signal,
      });
      if (!this.owns(request)) {
        return;
      }
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        this.arguments_.eventTarget,
        'alteditor-lite:success',
        {
          editor: this.arguments_.editor,
          mode: 'dialog',
          operation: 'create',
          row,
          type: 'success',
          values,
        },
      );
      if (!this.owns(request)) {
        return;
      }

      this.arguments_.operationOwner.complete(request);
      presentation.completeSuccess(form);
      this.arguments_.onPresentationComplete();
      await this.arguments_.errorReporter.runAfterSuccess({
        mode: 'dialog',
        operation: 'create',
        row,
        values,
      });
    } catch (rawError: unknown) {
      this.handleFailure(form, presentation, request, rawError, phase);
    }
  }

  private owns(request: OwnedOperationRequest<'create'>): boolean {
    return this.arguments_.operationOwner.owns(request);
  }

  private async createRow(
    values: Readonly<EditorValues<TFormValues>>,
    request: OwnedOperationRequest<'create'>,
  ): Promise<TRow> {
    const { options, operationOwner } = this.arguments_;
    if (options.operations?.create !== undefined) {
      const rowCandidate: unknown = await options.operations.create(
        values,
        operationOwner.context(request),
      );
      assertCompleteRow(rowCandidate, 'operations.create');
      return rowCandidate as TRow;
    }

    if (options.clientSide?.createRow === undefined) {
      throw new EditorConfigurationError(
        'Create requires operations.create or clientSide.createRow.',
      );
    }

    const rowCandidate: unknown = options.clientSide.createRow(values);
    if (isPromiseLike(rowCandidate)) {
      throw new EditorConfigurationError(
        'clientSide.createRow must return synchronously.',
      );
    }
    assertCompleteRow(rowCandidate, 'clientSide.createRow');
    return rowCandidate as TRow;
  }

  private handleFailure(
    form: EditorFormController<TFormValues>,
    presentation: DialogCreatePresentation<TFormValues>,
    request: OwnedOperationRequest<'create'>,
    rawError: unknown,
    phase: EditorErrorHookContext['phase'],
  ): void {
    if (!this.owns(request)) {
      return;
    }

    const operationError = normalizeOperationError(
      rawError,
      request.abortController.signal,
      this.arguments_.language,
    );
    this.arguments_.operationOwner.complete(request);
    if (operationError instanceof InternalOperationAbort) {
      presentation.restoreAfterAbort(form);
      return;
    }

    presentation.showOperationError(form, operationError);
    this.arguments_.errorReporter.report(
      operationError,
      {
        committed: false,
        mode: 'dialog',
        operation: 'create',
        phase,
      },
      true,
    );
  }
}
