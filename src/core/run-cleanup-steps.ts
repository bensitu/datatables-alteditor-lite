/** Runs every cleanup step and rethrows the first failure after all steps finish. */
export function runCleanupSteps(steps: readonly (() => void)[]): void {
  let firstFailure: unknown;
  let hasFailure = false;

  for (const step of steps) {
    try {
      step();
    } catch (error: unknown) {
      if (!hasFailure) {
        firstFailure = error;
        hasFailure = true;
      }
    }
  }

  if (hasFailure) {
    throw firstFailure;
  }
}
