export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneReadonlyContainer(
  value: unknown,
  clones: WeakMap<object, unknown>,
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
      value: cloneReadonlyContainer(Reflect.get(value, key), clones),
      writable: true,
    });
  }
  return Object.freeze(clone);
}

/** Creates a recursively detached plain-data view for public operation contexts. */
export function createReadonlyRowView<TRow extends object>(
  row: Readonly<TRow>,
): Readonly<TRow> {
  return cloneReadonlyContainer(row, new WeakMap(), true) as Readonly<TRow>;
}
