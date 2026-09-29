/** Floating image positions use points within the column and either the paragraph or page. */
export interface WordImagePosition {
  readonly layout?: 'inline' | 'front' | 'behind';
  readonly alignment?: 'left' | 'center' | 'right';
  readonly moveWithText?: boolean;
  readonly x?: number;
  readonly y?: number;
}

export function imagePlacement(position: WordImagePosition, width: number, availableWidth: number) {
  const { layout = 'inline', alignment = 'left', moveWithText = true, x, y = 0 } = position;
  if (!['inline', 'front', 'behind'].includes(layout) || !['left', 'center', 'right'].includes(alignment)) throw new TypeError('Invalid image placement.');
  if (typeof moveWithText !== 'boolean' || [x ?? 0, y].some(value => !Number.isFinite(value) || Math.abs(value) > 1584)) throw new RangeError('Invalid image position.');
  if (layout === 'inline') return { open: '<wp:inline>', close: '</wp:inline>', wrap: '' };
  const horizontal = x ?? (alignment === 'center' ? (availableWidth - width) / 2 : alignment === 'right' ? availableWidth - width : 0);
  return {
    open: `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="${layout === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(horizontal * 12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="${moveWithText ? 'paragraph' : 'page'}"><wp:posOffset>${Math.round(y * 12700)}</wp:posOffset></wp:positionV>`,
    close: '</wp:anchor>',
    wrap: '<wp:wrapNone/>',
  };
}
