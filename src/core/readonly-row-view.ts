export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneRowContainer(
  value: unknown,
  clones: WeakMap<object, unknown>,
  freeze: boolean,
  cloneRecord = false,
): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const existingClone = clones.get(value);
  if (existingClone !== undefined) {
    return existingClone;
  }
  const isArray = Array.isArray(value);
  if (!isArray && !cloneRecord && !isPlainRecord(value)) {
    return value;
  }

  const clonePrototype = (
    cloneRecord ? Object.prototype : Object.getPrototypeOf(value)
  ) as object | null;
  const clone = isArray
    ? new Array<unknown>(value.length)
    : (Object.create(clonePrototype) as Record<PropertyKey, unknown>);
  clones.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true) {
      continue;
    }
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneRowContainer(Reflect.get(value, key), clones, freeze),
      writable: true,
    });
  }
  return freeze ? Object.freeze(clone) : clone;
}

/** Creates a recursively detached plain-data view for public operation contexts. */
export function createReadonlyRowView<TRow extends object>(
  row: Readonly<TRow>,
): Readonly<TRow> {
  return cloneRowContainer(row, new WeakMap(), true, true) as Readonly<TRow>;
}

/** Copies plain row data for restoration without freezing application records. */
export function createMutableRowCopy<TRow extends object>(row: Readonly<TRow>): TRow {
  return cloneRowContainer(row, new WeakMap(), false, true) as TRow;
}
