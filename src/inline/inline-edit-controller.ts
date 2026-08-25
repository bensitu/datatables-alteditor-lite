import { EditorOperationBusyError } from '../core/alt-editor-lite-error.js';
import { runCleanupSteps } from '../core/run-cleanup-steps.js';
import { KeyTableInlineIntegration } from '../datatables/key-table-inline-integration.js';

import {
  InlineEditSessionController,
  type InlineEditSessionControllerArguments,
} from './inline-edit-session-controller.js';

import type { InlineActivationTarget } from './inline-activation.js';
import type { InlineColumnMappingRegistry } from './inline-column-mapping-registry.js';
import type { InlineEditPresentation } from './inline-edit-presentation.js';
import type { InlineEditState } from './inline-edit-state.js';
import type { ColumnSelector, RowSelector } from 'datatables.net';

export interface InlineEditControllerArguments<
  TRow extends object,
  TFormValues extends object,
> extends Omit<
  InlineEditSessionControllerArguments<TRow, TFormValues>,
  'interactionBehavior' | 'mappings' | 'onSessionEnd' | 'onSessionStart' | 'viewFactory'
> {
  readonly mappingRegistry: InlineColumnMappingRegistry<TRow, TFormValues>;
  readonly presentation: Readonly<InlineEditPresentation<TRow, TFormValues>>;
}

/** Coordinates activation, extension integration, and one inline session owner. */
export class InlineEditController<TRow extends object, TFormValues extends object> {
  private readonly activationAbortController = new AbortController();

  private readonly detachActivation: () => void;

  private readonly keyTableIntegration: KeyTableInlineIntegration<TRow, TFormValues>;

  private readonly sessionController: InlineEditSessionController<TRow, TFormValues>;

  public constructor(
    private readonly controllerArguments: InlineEditControllerArguments<
      TRow,
      TFormValues
    >,
  ) {
    const { mappingRegistry, presentation, ...sessionArguments } = controllerArguments;
    this.sessionController = new InlineEditSessionController({
      ...sessionArguments,
      interactionBehavior: presentation.interactionBehavior,
      mappings: mappingRegistry.mappings,
      onSessionEnd: () => {
        this.keyTableIntegration.restore();
        presentation.activationStrategy.resume?.();
      },
      onSessionStart: () => {
        presentation.activationStrategy.suspend?.();
        this.keyTableIntegration.suspend();
      },
      viewFactory: presentation.viewFactory,
    });
    this.keyTableIntegration = new KeyTableInlineIntegration(
      controllerArguments.table,
      controllerArguments.tableElement,
      mappingRegistry.mappings,
      controllerArguments.options.keyboardActivation,
      (target) => {
        this.activate(target);
      },
      (cell) => {
        presentation.activationStrategy.presentCell?.(cell);
      },
    );

    this.detachActivation = controllerArguments.enabled
      ? presentation.activationStrategy.attach({
          mappings: mappingRegistry.mappings,
          onActivate: (target) => {
            this.activate(target);
          },
          signal: this.activationAbortController.signal,
          table: controllerArguments.table,
          tableElement: controllerArguments.tableElement,
        })
      : () => undefined;

    if (controllerArguments.enabled) {
      this.keyTableIntegration.attach();
      controllerArguments.table.on('columns-reordered.altEditorLiteInlineMapping', () => {
        mappingRegistry.rebuild();
        this.keyTableIntegration.refreshFocusedCell();
      });
    }
  }

  public open(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void> {
    const activationStrategy = this.controllerPresentation.activationStrategy;
    activationStrategy.suspend?.();
    return this.sessionController.open(rowSelector, columnSelector).finally(() => {
      if (!this.sessionController.isEditing()) {
        activationStrategy.resume?.();
      }
    });
  }

  public submit(): Promise<void> {
    return this.sessionController.submit();
  }

  public cancel(): Promise<void> {
    return this.sessionController.cancel('api');
  }

  public getState(): Readonly<InlineEditState> {
    return this.sessionController.getState();
  }

  public isEditing(): boolean {
    return this.sessionController.isEditing();
  }

  public async prepareForExternalOperation(): Promise<void> {
    if (!this.sessionController.isEditing()) {
      return;
    }
    if (this.controllerPresentation.conflictPolicy === 'require-explicit-resolution') {
      throw new EditorOperationBusyError();
    }
    await this.sessionController.cancel('api');
  }

  public allowsExternalOperation(): boolean {
    return (
      !this.sessionController.isEditing() ||
      this.controllerPresentation.conflictPolicy === 'cancel-before-operation'
    );
  }

  public destroy(): void {
    runCleanupSteps([
      () => {
        this.activationAbortController.abort();
      },
      () => {
        this.detachActivation();
      },
      () => {
        this.controllerArguments.table.off('.altEditorLiteInlineMapping');
      },
      () => {
        this.keyTableIntegration.destroy();
      },
      () => {
        this.sessionController.destroy();
      },
    ]);
  }

  private get controllerPresentation(): Readonly<
    InlineEditPresentation<TRow, TFormValues>
  > {
    return this.controllerArguments.presentation;
  }

  private readonly activate = (target: Readonly<InlineActivationTarget>): void => {
    void this.open(target.rowIndex, target.columnIndex).catch(() => undefined);
  };
}
