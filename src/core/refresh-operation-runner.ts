import { dispatchEditorIntegrationUpdate } from '../datatables/editor-integration-event.js';

import { EditorOperationBusyError } from './alt-editor-lite-error.js';
import { dispatchEditorEvent } from './editor-event.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from './error-normalization.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';
import type { AltEditorLite } from './alt-editor-lite.js';
import type {
  InteractionCoordinator,
  InteractionToken,
} from './editing/interaction-coordinator.js';
import type { OperationOwner } from './editing/operation-owner.js';
import type { EditorErrorReporter } from './editor-error-reporter.js';
import type { EditorStateCoordinator } from './editor-state-coordinator.js';
import type { HostRefreshCapability } from '../host/editor-host.js';
import type { Api } from 'datatables.net';

export interface RefreshOperationRunnerArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly table: Api<TRow>;
  readonly host: HostRefreshCapability;
  readonly tableElement: HTMLTableElement;
  readonly options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly stateCoordinator: EditorStateCoordinator;
  readonly interactionCoordinator: InteractionCoordinator;
  readonly operationOwner: OperationOwner;
  readonly errorReporter: EditorErrorReporter<TRow, TFormValues>;
  readonly prepareForExternalOperation: () => Promise<void>;
}

/** Owns the refresh lifecycle, persistence request, events, and interaction. */
export class RefreshOperationRunner<TRow extends object, TFormValues extends object> {
  private interactionToken: InteractionToken | undefined;

  public constructor(
    private readonly arguments_: RefreshOperationRunnerArguments<TRow, TFormValues>,
  ) {}

  /** Runs the configured refresh operation or the DataTables fallback. */
  public async run(): Promise<void> {
    let didAcquireInteraction = false;
    try {
      this.arguments_.stateCoordinator.assertActive();
      await this.arguments_.prepareForExternalOperation();
      this.assertReady();
      this.interactionToken = this.arguments_.interactionCoordinator.acquire('refresh');
      didAcquireInteraction = true;
      this.notifyIntegration();
      await this.execute();
    } catch (error: unknown) {
      if (didAcquireInteraction) {
        this.releaseInteraction();
      }
      throw error instanceof Error
        ? error
        : new Error('AltEditorLite refresh failed with a non-Error value.', {
            cause: error,
          });
    }
  }

  /** Releases presentation ownership during editor destruction. */
  public destroy(): void {
    this.releaseInteraction();
  }

  private assertReady(): void {
    if (
      this.arguments_.stateCoordinator.getState().status !== 'ready' ||
      this.arguments_.interactionCoordinator.current() !== 'none'
    ) {
      throw new EditorOperationBusyError();
    }
  }

  private async execute(): Promise<void> {
    const {
      editor,
      errorReporter,
      language,
      operationOwner,
      options,
      host,
      stateCoordinator,
      table,
      tableElement,
    } = this.arguments_;
    stateCoordinator.transitionTo({ status: 'refreshing' });
    const request = operationOwner.begin('refresh', 'api');
    let didSucceed = false;
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      tableElement,
      'alteditor-lite:refresh',
      {
        editor,
        mode: 'api',
        operation: 'refresh',
        phase: 'start',
        type: 'refresh',
      },
    );
    if (!operationOwner.owns(request)) {
      return;
    }

    try {
      if (options.operations?.refresh === undefined) {
        await host.refresh(request.abortController.signal);
      } else {
        await host.refresh(request.abortController.signal, async () => {
          await Promise.resolve(
            options.operations?.refresh?.(operationOwner.context(table, request)),
          );
        });
      }
      if (!operationOwner.owns(request)) {
        return;
      }
      didSucceed = true;
      dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
        tableElement,
        'alteditor-lite:success',
        {
          editor,
          mode: 'api',
          operation: 'refresh',
          type: 'success',
        },
      );
    } catch (rawError: unknown) {
      if (!operationOwner.owns(request)) {
        return;
      }

      const operationError = normalizeOperationError(
        rawError,
        request.abortController.signal,
        language,
      );
      if (!(operationError instanceof InternalOperationAbort)) {
        errorReporter.report(
          operationError,
          {
            committed: false,
            mode: 'api',
            operation: 'refresh',
            phase: 'persistence',
          },
          true,
        );
        if (!operationOwner.owns(request)) {
          return;
        }
      }
    }

    operationOwner.complete(request);
    this.releaseInteraction();
    stateCoordinator.transitionTo({ status: 'ready' });
    dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:refresh'>(
      tableElement,
      'alteditor-lite:refresh',
      {
        editor,
        mode: 'api',
        operation: 'refresh',
        phase: 'complete',
        type: 'refresh',
      },
    );
    if (didSucceed) {
      await errorReporter.runAfterSuccess({
        mode: 'api',
        operation: 'refresh',
        table,
      });
    }
  }

  private releaseInteraction(): void {
    if (this.interactionToken !== undefined) {
      this.arguments_.interactionCoordinator.release(this.interactionToken);
      this.interactionToken = undefined;
      this.notifyIntegration();
    }
  }

  private notifyIntegration(): void {
    dispatchEditorIntegrationUpdate(this.arguments_.tableElement);
  }
}
