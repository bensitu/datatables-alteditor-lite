import { describe, expect, it } from 'vitest';

import type {
  EditorHost,
  HostApplyContext,
  HostRowCollectionCapability,
} from '../../src/host/editor-host.js';

interface MemoryRecord {
  readonly id: string;
  readonly name: string;
}

class MemoryHost
  implements
    EditorHost<MemoryRecord, string>,
    HostRowCollectionCapability<MemoryRecord, string>
{
  public readonly eventTarget = new EventTarget();

  public readonly ownershipKey = {};

  private readonly records = new Map<string, MemoryRecord>();

  public read(target: string): Readonly<MemoryRecord> {
    const record = this.records.get(target);
    if (record === undefined) {
      throw new Error(`Unknown record: ${target}`);
    }
    return record;
  }

  public applyCreate(
    row: MemoryRecord,
    context: Readonly<HostApplyContext>,
  ): Promise<string> {
    context.signal.throwIfAborted();
    this.records.set(row.id, row);
    return Promise.resolve(row.id);
  }

  public applyUpdate(
    target: string,
    row: MemoryRecord,
    context: Readonly<HostApplyContext>,
  ): Promise<string> {
    context.signal.throwIfAborted();
    this.records.set(target, row);
    return Promise.resolve(target);
  }

  public applyRemove(
    targets: readonly string[],
    context: Readonly<HostApplyContext>,
  ): Promise<void> {
    context.signal.throwIfAborted();
    for (const target of targets) {
      this.records.delete(target);
    }
    return Promise.resolve();
  }

  public entries(): Iterable<{
    readonly target: string;
    readonly row: Readonly<MemoryRecord>;
  }> {
    return [...this.records].map(([target, row]) => ({ row, target }));
  }

  public destroy(): void {
    this.records.clear();
  }
}

describe('EditorHost contract', () => {
  it('supports record state without table-specific concepts', async () => {
    const host = new MemoryHost();
    const context = {
      mode: 'api',
      operation: 'create',
      signal: new AbortController().signal,
    } as const satisfies HostApplyContext;

    await host.applyCreate({ id: 'record-a', name: 'Alpha' }, context);

    expect(host.read('record-a')).toEqual({ id: 'record-a', name: 'Alpha' });
    expect([...host.entries()]).toEqual([
      { row: { id: 'record-a', name: 'Alpha' }, target: 'record-a' },
    ]);
    expect(host.eventTarget).toBeInstanceOf(EventTarget);
  });
});
