interface ColumnVisibilityApi {
  responsiveHidden?: () => unknown;
  visible(): boolean;
}

/** Returns whether a column is available in the main table presentation. */
export function isColumnVisiblyAvailable(column: ColumnVisibilityApi): boolean {
  if (!column.visible()) {
    return false;
  }

  const responsiveVisibility = column.responsiveHidden;
  return (
    typeof responsiveVisibility !== 'function' ||
    responsiveVisibility.call(column) === true
  );
}
