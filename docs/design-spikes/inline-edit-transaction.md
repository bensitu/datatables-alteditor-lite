# Shared edit transaction design

## Purpose

Dialog editing and single-cell inline editing use one persistence transaction. Presentation-specific code owns field rendering, validation feedback, focus, and cleanup. Shared code owns operation sequencing, target revalidation, lifecycle callbacks, persistence selection, complete-row validation, commit ordering, and normalized failures.

## Transaction data

Each edit transaction contains:

- the presentation mode (`dialog` or `inline`);
- an immutable view of the original row;
- the complete collected values available to validation and persistence;
- exact collected field values, including an explicit `undefined`;
- the declared field paths changed by the presentation;
- a public row and optional column target.

Inline values originate from the row object through declared field paths. Rendered cell text is never used as an editing value.

## Shared and presentation boundaries

The shared runner performs the following ordered work:

1. begins an owned edit request;
2. asks the presentation to validate and collect values;
3. confirms request ownership and target identity;
4. invokes `beforeSubmit` as a veto-only callback;
5. publishes the submit event and revalidates the target;
6. chooses the remote update, synchronous client mapping, or declared-field merge;
7. confirms ownership and target identity after persistence;
8. commits a complete replacement row or runs the configured refresh operation;
9. waits for the owned draw or refresh to finish;
10. publishes success and lets the presentation close and restore focus;
11. invokes `afterSuccess` without changing the committed result.

Dialog and inline adapters implement the presentation boundary independently. Neither adapter duplicates persistence selection or error normalization.

## Draw and focus boundary

An owned draw token distinguishes a commit draw from an unrelated DataTables redraw. External redraws are allowed to continue and close an active inline session without restoring detached cell content.

Focus after a successful update is resolved from logical row and column identity after the draw. Pre-draw controls and cell nodes are never used as post-draw focus targets. Sequential Tab navigation begins only after the preceding draw token has been released.

## Failure and cancellation

Validation failures retain the candidate value and presentation. Persistence failures do not mutate canonical DataTables row data and allow retry when the normalized error is retryable. Cancellation aborts the owned request, and all asynchronous boundaries recheck ownership before continuing.

Row and cell identity are checked before event publication, after observer callbacks, after persistence, and before mutation. A stale target fails closed without guessing another row or column.
