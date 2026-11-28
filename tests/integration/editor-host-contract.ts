import { describe, expect, it, vi } from 'vitest';

import { AltEditorLite } from '../../src/editor/alt-editor-lite.js';

import { installDialogElementSupport } from './standalone-test-fixture.js';

import type { EditorHost, HostApplyContext } from '../../src/host/editor-host.js';

export interface HostContractRecord {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
  readonly department?: string;
}

export interface HostContractFixture<TTarget> {
  readonly eventTarget: EventTarget;
  readonly host: EditorHost<HostContractRecord, TTarget>;
  readonly initialTarget: TTarget;
}

function createContext(
  operation: HostApplyContext['operation'],
): Readonly<HostApplyContext> {
  return {
    mode: 'api',
    operation,
    signal: new AbortController().signal,
  };
}

/** Registers behavior shared by every supported record host. */
export function describeEditorHostContract<TTarget>(
  name: string,
  createFixture: () => HostContractFixture<TTarget>,
): void {
  describe(`${name} record contract`, () => {
    it('preserves the record when persistence omits an unedited field', async () => {
      const { host, eventTarget, initialTarget } = createFixture();
      const restore = installDialogElementSupport();
      const onError = vi.fn();
      const success = vi.fn();
      const editor = new AltEditorLite(host, {
        fields: [{ name: 'name', type: 'text', label: 'Name' }],
        operations: {
          update: () => ({ id: 'row-a', name: 'Updated' }) as HostContractRecord,
        },
        hooks: { onError },
      });
      try {
        eventTarget.addEventListener('alteditor-lite:success', success);
        const original = await host.read(initialTarget);
        await editor.openEditDialog(initialTarget);
        editor.getField('name')?.setValue('Updated');
        document.querySelector<HTMLFormElement>('.alteditor-lite-form')?.requestSubmit();
        await vi.waitFor(() => {
          expect(onError).toHaveBeenCalledOnce();
        });
        expect(await host.read(initialTarget)).toEqual(original);
        expect(success).not.toHaveBeenCalled();
      } finally {
        editor.destroy();
        restore();
      }
    });

    it('reads and applies canonical record changes through opaque targets', async () => {
      const fixture = createFixture();
      const { host } = fixture;

      try {
        expect(host.eventTarget).toBe(fixture.eventTarget);
        expect(typeof host.ownershipKey).toBe('object');
        expect(await host.read(fixture.initialTarget)).toMatchObject({
          id: 'row-a',
          name: 'Alpha',
        });

        const createdTarget = await host.applyCreate(
          { id: 'row-created', name: 'Created', rank: 10, department: 'Sales' },
          createContext('create'),
        );
        expect(createdTarget).toBeDefined();
        if (createdTarget === undefined) {
          throw new Error('The host did not return the created record target.');
        }
        expect(await host.read(createdTarget)).toEqual({
          department: 'Sales',
          id: 'row-created',
          name: 'Created',
          rank: 10,
        });

        const updatedTarget = await host.applyUpdate(
          createdTarget,
          { id: 'row-created', name: 'Updated', rank: 11 },
          createContext('edit'),
        );
        expect(updatedTarget).toBeDefined();
        if (updatedTarget === undefined) {
          throw new Error('The host did not return the updated record target.');
        }
        expect(await host.read(updatedTarget)).toEqual({
          id: 'row-created',
          name: 'Updated',
          rank: 11,
        });

        await host.applyRemove([updatedTarget], createContext('remove'));
        await expect(async () => await host.read(updatedTarget)).rejects.toThrow();
      } finally {
        host.destroy();
        host.destroy();
      }
    });
  });
}
