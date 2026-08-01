/**
 * Configuration accepted by the public base error.
 */
export interface AltEditorLiteErrorOptions {
  /** Human-readable message safe to present in the editor UI. */
  readonly message: string;
  /** Stable machine-readable error code. */
  readonly code?: string;
  /** Errors associated with configured field paths. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** Whether retrying the same operation can be meaningful. */
  readonly retryable?: boolean;
  /** Original value that caused this error. */
  readonly cause?: unknown;
}

/**
 * Base error for recoverable editor failures.
 *
 * The error itself does not mutate DataTables or transition editor state.
 * Callers decide whether it is shown in an open dialog and whether retry is
 * available.
 */
export class AltEditorLiteError extends Error {
  /** Stable machine-readable error code, when supplied. */
  public readonly code: string | undefined;

  /** Errors associated with configured field paths, when supplied. */
  public readonly fieldErrors: Readonly<Record<string, string>> | undefined;

  /** Whether retrying the failed operation can be meaningful. */
  public readonly retryable: boolean;

  /**
   * Creates an editor error without changing editor or DataTables state.
   *
   * @param options - Public error properties.
   */
  public constructor(options: AltEditorLiteErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Indicates that an active editor already owns the requested table element.
 *
 * Construction fails before editor state or DataTables rows are changed. The
 * existing instance can continue to be used.
 */
export class EditorAlreadyInitializedError extends AltEditorLiteError {
  /** Creates the duplicate-instance error. */
  public constructor() {
    super({
      code: 'ALREADY_INITIALIZED',
      message: 'An AltEditorLite instance already owns this table.',
      retryable: false,
    });
  }
}

/**
 * Indicates that editor options or a configured capability are invalid.
 *
 * Configuration failures do not mutate DataTables. They are retryable only
 * after the consumer corrects the configuration.
 */
export class EditorConfigurationError extends AltEditorLiteError {
  /**
   * Creates a configuration error.
   *
   * @param message - Stable explanation of the invalid configuration.
   * @param cause - Optional original failure.
   */
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'CONFIGURATION',
      message,
      retryable: false,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

/**
 * Indicates that a second operation was requested while the editor was busy.
 *
 * The active operation and current editor state remain unchanged, and
 * DataTables is not mutated.
 */
export class EditorOperationBusyError extends AltEditorLiteError {
  /** Creates a busy-operation error. */
  public constructor() {
    super({
      code: 'OPERATION_BUSY',
      message: 'The editor is busy with another operation.',
      retryable: true,
    });
  }
}

/**
 * Indicates that selection-based targeting was requested without Select.
 *
 * The editor remains ready and DataTables is not mutated. Supplying an
 * explicit public row selector or loading Select makes the request retryable.
 */
export class EditorSelectionUnavailableError extends AltEditorLiteError {
  /**
   * Creates a selection-capability error.
   *
   * @param message - Localized safe explanation.
   */
  public constructor(
    message = 'DataTables Select is required when no row selector is provided.',
  ) {
    super({
      code: 'SELECTION_UNAVAILABLE',
      message,
      retryable: true,
    });
  }
}

/**
 * Indicates that a selection or explicit selector resolved the wrong row count.
 *
 * The editor remains ready and DataTables is not mutated. The caller can
 * correct the selector or selection and retry.
 */
export class EditorSelectionCountError extends AltEditorLiteError {
  /** Number of rows resolved by the failed request. */
  public readonly actualCount: number;

  /** Required selection cardinality. */
  public readonly expected: 'exactly-one' | 'one-or-more';

  /**
   * Creates a selection-count error.
   *
   * @param expected - Required cardinality.
   * @param actualCount - Number of rows actually resolved.
   * @param message - Localized safe explanation.
   */
  public constructor(
    expected: 'exactly-one' | 'one-or-more',
    actualCount: number,
    message: string,
  ) {
    super({
      code: 'SELECTION_COUNT',
      message,
      retryable: true,
    });
    this.actualCount = actualCount;
    this.expected = expected;
  }
}

/**
 * Indicates that an Edit or Remove snapshot can no longer identify its rows.
 *
 * The persistence callback is not invoked when detected before submission.
 * If detected after an asynchronous callback, AltEditorLite still performs no
 * DataTables mutation. Closing and opening a new dialog is required.
 */
export class EditorTargetUnavailableError extends AltEditorLiteError {
  /**
   * Creates a stale-target error.
   *
   * @param message - Localized safe explanation.
   */
  public constructor(message = 'The selected row is no longer available.') {
    super({
      code: 'TARGET_UNAVAILABLE',
      message,
      retryable: false,
    });
  }
}

/**
 * Indicates that a public method was called after the instance was destroyed.
 *
 * The destroyed state remains unchanged and DataTables is not mutated.
 */
export class EditorDestroyedError extends AltEditorLiteError {
  /** Creates a destroyed-instance error. */
  public constructor() {
    super({
      code: 'DESTROYED',
      message: 'This AltEditorLite instance has been destroyed.',
      retryable: false,
    });
  }
}

/**
 * Indicates that an editor language resource could not be loaded.
 */
export class EditorLanguageLoadError extends AltEditorLiteError {
  /**
   * Creates a language-load error without changing editor or table state.
   *
   * @param message - Safe explanation of the failed language load.
   * @param cause - Optional original failure.
   * @param retryable - Whether another request may succeed. Defaults to true.
   */
  public constructor(
    message = 'The requested editor language could not be loaded.',
    cause?: unknown,
    retryable = true,
  ) {
    super({
      code: 'LANGUAGE_LOAD',
      message,
      retryable,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

/**
 * Indicates that selected files exceed a configured size or count budget.
 *
 * The dialog stays open, no DataTables mutation occurs, and the user can retry
 * with a different file selection.
 */
export class EditorFileLimitError extends AltEditorLiteError {
  /**
   * Creates a file-budget error.
   *
   * @param message - Safe explanation of the exceeded limit.
   */
  public constructor(message: string) {
    super({
      code: 'FILE_LIMIT',
      message,
      retryable: true,
    });
  }
}
