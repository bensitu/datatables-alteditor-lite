/**
 * Owns monotonically increasing request identities used to ignore stale work.
 */
export class RequestSequence {
  private currentSequence = 0;

  /**
   * Starts a new owned request and invalidates all previous identities.
   *
   * @returns Identity owned by the new request.
   */
  public next(): number {
    this.currentSequence += 1;
    return this.currentSequence;
  }

  /**
   * Invalidates the currently owned request without starting asynchronous work.
   */
  public invalidate(): void {
    this.currentSequence += 1;
  }

  /**
   * Checks whether a request identity is still owned by this sequence.
   *
   * @param requestSequence - Identity captured when work started.
   * @returns Whether that work may still update state.
   */
  public isCurrent(requestSequence: number): boolean {
    return requestSequence === this.currentSequence;
  }
}
