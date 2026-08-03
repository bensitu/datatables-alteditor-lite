import { EditorFileLimitError } from '../core/alt-editor-lite-error.js';

/** Default per-file limit applied before a data URL read. */
export const DEFAULT_DATA_URL_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Default selection limit applied before multiple data URL reads. */
export const DEFAULT_DATA_URL_MAX_FILE_COUNT = 5;

/**
 * File selection budgets checked before content is read.
 */
export interface FileBudget {
  readonly maxFileBytes?: number;
  readonly maxFileCount?: number;
}

/**
 * User-facing messages for file budget failures.
 */
export interface FileBudgetMessages {
  readonly fileCount: string;
  readonly fileSize: string;
}

/**
 * Rejects a file selection that exceeds configured count or size limits.
 *
 * @param files - Selected files.
 * @param budget - Optional maximum count and per-file byte size.
 * @param messages - User-facing limit messages.
 * @throws EditorFileLimitError before any file content is read.
 */
export function validateFileBudget(
  files: readonly File[],
  budget: Readonly<FileBudget>,
  messages: Readonly<FileBudgetMessages>,
): void {
  if (budget.maxFileCount !== undefined && files.length > budget.maxFileCount) {
    throw new EditorFileLimitError(messages.fileCount);
  }

  const maxFileBytes = budget.maxFileBytes;
  if (maxFileBytes !== undefined && files.some((file) => file.size > maxFileBytes)) {
    throw new EditorFileLimitError(messages.fileSize);
  }
}
