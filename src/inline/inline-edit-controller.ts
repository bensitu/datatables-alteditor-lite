import { InlineDoubleClickActivation } from './inline-double-click-activation.js';
import {
  InlineEditSessionController,
  type InlineEditSessionControllerArguments,
} from './inline-edit-session-controller.js';

import type { InlineActivationStrategy } from './inline-activation-strategy.js';
import type { InlineEditState } from './inline-edit-state.js';
import type { ColumnSelector, RowSelector } from 'datatables.net';

/** Coordinates activation with the lifecycle owner for inline editing. */
export class InlineEditController<TRow extends object, TFormValues extends object> {
  private readonly activationAbortController = new AbortController();

  private readonly activationStrategy:
    InlineActivationStrategy<TRow, TFormValues> | undefined;

  private readonly detachActivation: () => void;

  private readonly sessionController: InlineEditSessionController<TRow, TFormValues>;

  public constructor(
    controllerArguments: InlineEditSessionControllerArguments<TRow, TFormValues>,
  ) {
    this.sessionController = new InlineEditSessionController(controllerArguments);
    this.activationStrategy = controllerArguments.enabled
      ? new InlineDoubleClickActivation<TRow, TFormValues>()
      : undefined;
    this.detachActivation =
      this.activationStrategy?.attach({
        mappings: controllerArguments.mappings,
        onActivate: (target) => {
          void this.sessionController
            .open(target.rowIndex, target.columnIndex)
            .catch(() => undefined);
        },
        signal: this.activationAbortController.signal,
        table: controllerArguments.table,
        tableElement: controllerArguments.tableElement,
      }) ?? (() => undefined);
  }

  public open(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void> {
    return this.sessionController.open(rowSelector, columnSelector);
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

  public destroy(): void {
    this.activationAbortController.abort();
    this.detachActivation();
    this.sessionController.destroy();
  }
}
