import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import type { AltEditorLiteOptions } from '../../src/core/alt-editor-lite-options.js';
import type { StandaloneHostOptions } from '../../src/standalone/standalone-host.js';

export interface StandaloneRecord {
  readonly id: string;
  readonly name: string;
}

export interface StandaloneValues {
  readonly name: string;
}

export interface StandaloneTestFixture {
  readonly editor: AltEditorLite<StandaloneRecord, StandaloneValues, string>;
  readonly eventTarget: EventTarget;
  readonly host: StandaloneHost<StandaloneRecord, string>;
  readonly records: Map<string, StandaloneRecord>;
}

const activeEditors = new Set<
  AltEditorLite<StandaloneRecord, StandaloneValues, string>
>();

export function createStandaloneTestFixture(
  editorOptions: Partial<AltEditorLiteOptions<StandaloneRecord, StandaloneValues>> = {},
  hostOptions: Partial<StandaloneHostOptions<StandaloneRecord, string>> = {},
): StandaloneTestFixture {
  const records = new Map<string, StandaloneRecord>([
    ['record-a', { id: 'record-a', name: 'Alpha' }],
  ]);
  const eventTarget = new EventTarget();
  const host = new StandaloneHost<StandaloneRecord, string>({
    applyCreate: (row) => {
      records.set(row.id, row);
      return row.id;
    },
    applyRemove: (targets) => {
      for (const target of targets) {
        records.delete(target);
      }
    },
    applyUpdate: (target, row) => {
      records.set(target, row);
      return target;
    },
    eventTarget,
    read: (target) => {
      const row = records.get(target);
      if (row === undefined) {
        throw new Error('The requested Standalone record is unavailable.');
      }
      return row;
    },
    ...hostOptions,
  });
  const editor = new AltEditorLite(host, {
    editing: { dialog: { enabled: true } },
    fields: [{ label: 'Name', name: 'name', required: true, type: 'text' }],
    ...editorOptions,
  });
  activeEditors.add(editor);
  return { editor, eventTarget, host, records };
}

export function destroyStandaloneTestFixtures(): void {
  for (const editor of activeEditors) {
    editor.destroy();
  }
  activeEditors.clear();
  document.body.replaceChildren();
}

export function installDialogElementSupport(): () => void {
  const showModalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  const closeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = false;
    },
  });

  return () => {
    if (showModalDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        showModalDescriptor,
      );
    }
    if (closeDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    } else {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
    }
  };
}
