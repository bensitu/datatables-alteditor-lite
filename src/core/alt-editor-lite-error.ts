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
