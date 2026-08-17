import { describe, expect, it } from 'vitest';

import type { EditorHost, HostApplyContext } from '../../src/host/editor-host.js';

export interface HostContractRecord {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
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
    it('reads and applies canonical record changes through opaque targets', async () => {
      const fixture = createFixture();
      const { host } = fixture;

      try {
        expect(host.eventTarget).toBe(fixture.eventTarget);
        expect(typeof host.ownershipKey).toBe('object');
        expect(host.read(fixture.initialTarget)).toMatchObject({
          id: 'row-a',
          name: 'Alpha',
        });

        const createdTarget = await host.applyCreate(
          { id: 'row-created', name: 'Created', rank: 10 },
          createContext('create'),
        );
        expect(createdTarget).toBeDefined();
        if (createdTarget === undefined) {
          throw new Error('The host did not return the created record target.');
        }
        expect(host.read(createdTarget)).toEqual({
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
        expect(host.read(updatedTarget)).toEqual({
          id: 'row-created',
          name: 'Updated',
          rank: 11,
        });

        await host.applyRemove([updatedTarget], createContext('remove'));
        expect(() => host.read(updatedTarget)).toThrow();
      } finally {
        host.destroy();
        host.destroy();
      }
    });
  });
}
