/** Returns whether an object defines an own property with the supplied key. */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
