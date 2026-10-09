import { wordPointsToCssPixels as px, type WordLayoutTableBorder } from '@tumblerjs/word';

/** Render the engine's resolved edge once, centred on its document coordinates. */
export function wordTableBorderCss(edge: WordLayoutTableBorder, originX = 0, originY = 0): string {
  const horizontal = edge.orientation === 'horizontal';
  const width = px(edge.border.widthPoints);
  const style = edge.border.style === 'single' ? 'solid' : edge.border.style;
  return `position:absolute;pointer-events:none;left:${px(edge.x-originX) - (horizontal ? 0 : width/2)}px;top:${px(edge.y-originY) - (horizontal ? width/2 : 0)}px;${horizontal ? 'width' : 'height'}:${px(edge.length)}px;border-${horizontal ? 'top' : 'left'}:${width}px ${style} ${edge.border.color}`;
}
