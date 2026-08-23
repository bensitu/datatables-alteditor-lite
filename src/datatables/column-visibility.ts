interface ColumnVisibilityApi {
  header?(): HTMLElement | null;
  responsiveHidden?: () => unknown;
  visible(): boolean;
}

/** Returns whether a column is available in the main table presentation. */
export function isColumnVisiblyAvailable(column: ColumnVisibilityApi): boolean {
  if (!column.visible()) {
    return false;
  }

  const responsiveVisibility = column.responsiveHidden;
  if (typeof responsiveVisibility !== 'function') {
    return true;
  }

  const responsiveState = responsiveVisibility.call(column);
  if (responsiveState !== false) {
    return responsiveState === true;
  }

  // Responsive also returns false when its API is registered but the table has not enabled it.
  const header = column.header?.();
  return header !== undefined && header !== null && header.style.display !== 'none';
}
