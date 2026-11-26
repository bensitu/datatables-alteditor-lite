import { isPlainRecord } from './readonly-row-view.js';

/** Checks the shape of a result returned by an application callback. */
export function isPlainCallbackResult(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  try {
    return !Array.isArray(value) && isPlainRecord(value);
  } catch {
    return false;
  }
}
