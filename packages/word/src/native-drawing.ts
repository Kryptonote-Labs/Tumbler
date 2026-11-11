import type { WordImagePosition } from './image-placement.ts';

/** One geometry projection for authored pictures and charts, in native Word points. */
export function nativeDrawingGeometry(id: number, drawing: WordImagePosition & { readonly width: number; readonly height: number; readonly alt?: string }, availableWidth: number, name: string) {
  if (![drawing.width, drawing.height].every(value => Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 12700)))) throw new RangeError('Invalid drawing dimensions.');
  const floating = drawing.layout && drawing.layout !== 'inline';
  return {
    elementId: id,
    placement: floating ? 'anchor' as const : 'inline' as const,
    widthPoints: Math.round(drawing.width * 12700) / 12700,
    heightPoints: Math.round(drawing.height * 12700) / 12700,
    name: `${name} ${id}`, altText: drawing.alt ?? '',
    anchor: floating ? {
      horizontalRelativeTo: drawing.horizontalRelativeTo ?? 'column', verticalRelativeTo: drawing.verticalRelativeTo ?? (drawing.moveWithText === false ? 'page' : 'paragraph'),
      horizontalOffsetPoints: drawing.x ?? (drawing.alignment === 'center' ? (availableWidth - drawing.width) / 2 : drawing.alignment === 'right' ? availableWidth - drawing.width : 0),
      verticalOffsetPoints: drawing.y ?? 0, ...(drawing.zOrder ? { zOrder: drawing.zOrder } : {}),
      wrap: 'none' as const, behindDocument: drawing.layout === 'behind', layoutInCell: true, allowOverlap: true,
      distanceTopPoints: 0, distanceEndPoints: 0, distanceBottomPoints: 0, distanceStartPoints: 0,
    } : undefined,
  };
}
