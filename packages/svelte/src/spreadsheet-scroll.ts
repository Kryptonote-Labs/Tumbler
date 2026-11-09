/** Keep browser layout sizes bounded while preserving the worksheet's logical pixel range. */
export function spreadsheetScrollAxis(total: number, viewport: number) {
  const extent = Math.min(total, 1_000_000);
  const logicalMaximum = Math.max(0, total - viewport);
  const physicalMaximum = Math.max(0, extent - viewport);
  const ratio = physicalMaximum > 0 ? logicalMaximum / physicalMaximum : 1;
  return {
    extent,
    compressed: total > extent,
    physical: (logical: number) => Math.max(0, Math.min(logicalMaximum, logical)) / ratio,
    logical: (physical: number) => Math.max(0, Math.min(physicalMaximum, physical)) * ratio,
  };
}
