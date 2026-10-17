import { isWordDrawingPosition, type WordDrawingPosition } from './drawing-placement.ts';
import type { WordDrawing } from './drawings.ts';

/** Geometry overrides for a drawing retained in the source package. Coordinates default to page-relative for legacy geometry. */
export interface WordDrawingGeometry extends WordDrawingPosition {
  readonly width: number;
  readonly height: number;
}

export function isWordDrawingGeometry(value: unknown): value is WordDrawingGeometry {
  if (!value || typeof value !== 'object') return false;
  const geometry = value as Record<string, unknown>;
  return (
    Object.keys(geometry).every((key) => ['width', 'height', 'layout', 'x', 'y', 'horizontalRelativeTo', 'verticalRelativeTo', 'wrap'].includes(key)) &&
    isWordDrawingPosition(value as WordDrawingPosition) &&
    ['width', 'height'].every(
      (key) =>
        typeof geometry[key] === 'number' &&
        Number.isSafeInteger(Math.round(Number(geometry[key]) * 12700)) &&
        Math.round(Number(geometry[key]) * 12700) > 0,
    ) &&
    (geometry.layout === undefined ||
      (typeof geometry.layout === 'string' &&
        ['inline', 'front', 'behind'].includes(geometry.layout))) &&
    ['x', 'y'].every(
      (key) =>
        geometry[key] === undefined ||
        (typeof geometry[key] === 'number' &&
          Number.isFinite(geometry[key]) &&
          Math.round(Number(geometry[key]) * 12700) >= -2147483648 &&
          Math.round(Number(geometry[key]) * 12700) <= 2147483647),
    )
  );
}

/** Apply geometry without replacing chart data or the original wrapping settings. */
export function withWordDrawingGeometry(
  drawing: WordDrawing,
  geometry?: WordDrawingGeometry,
): WordDrawing {
  if (!geometry) return drawing;
  if (!isWordDrawingGeometry(geometry)) throw new TypeError('Invalid drawing geometry.');
  const layout =
    geometry.layout ??
    (drawing.placement === 'inline'
      ? 'inline'
      : drawing.anchor?.behindDocument
        ? 'behind'
        : 'front');
  const { horizontalAlignment, ...offsetAnchor } = drawing.anchor ?? {};
  const anchor = geometry.x !== undefined || geometry.horizontalRelativeTo !== undefined ? offsetAnchor : drawing.anchor;
  return {
    ...drawing,
    widthPoints: geometry.width,
    heightPoints: geometry.height,
    placement: layout === 'inline' ? 'inline' : 'anchor',
    anchor:
      layout === 'inline'
        ? undefined
        : {
            horizontalRelativeTo: 'page',
            verticalRelativeTo: 'page',
            horizontalOffsetPoints: 0,
            verticalOffsetPoints: 0,
            wrap: 'none',
            behindDocument: layout === 'behind',
            allowOverlap: true,
            distanceTopPoints: 0,
            distanceEndPoints: 0,
            distanceBottomPoints: 0,
            distanceStartPoints: 0,
            ...(geometry.layout === undefined ||
            geometry.layout === (drawing.anchor?.behindDocument ? 'behind' : 'front')
              ? anchor
              : {}),
            ...(geometry.x !== undefined || geometry.y !== undefined || geometry.horizontalRelativeTo !== undefined || geometry.verticalRelativeTo !== undefined
              ? {
                  horizontalRelativeTo: geometry.horizontalRelativeTo ?? 'page',
                  horizontalOffsetPoints: geometry.x ?? 0,
                  verticalRelativeTo: geometry.verticalRelativeTo ?? 'page',
                  verticalOffsetPoints: geometry.y ?? 0,
                }
              : {}),
            ...(geometry.wrap ? { wrap: geometry.wrap } : {}),
            ...(geometry.layout ? { behindDocument: layout === 'behind' } : {}),
          },
  };
}
