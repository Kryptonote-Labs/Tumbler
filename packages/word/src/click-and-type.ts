import type { WordLayoutLine } from './layout.ts';

export interface WordClickAndTypeTarget {
  readonly paragraphElementId: number;
  readonly offset: number;
  readonly paragraphs: number;
  readonly positionTwips: number;
  readonly alignment: 'left' | 'center' | 'right';
}

/** Resolve blank-space intent in document points. Existing ink remains ordinary hit testing. */
export function wordClickAndTypeTarget(lines: readonly WordLayoutLine[], point: {x:number;y:number}, bounds: {left:number;right:number;top:number;bottom:number}): WordClickAndTypeTarget | undefined {
  if (!lines.length || ![point.x,point.y,bounds.left,bounds.right,bounds.top,bounds.bottom].every(Number.isFinite)) return undefined;
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return undefined;
  if (lines.some(line => point.y >= line.y && point.y <= line.y + line.height && line.fragments.some(fragment => fragment.kind !== 'tab' && point.x >= fragment.x && point.x <= fragment.x + fragment.width))) return undefined;
  const preceding = lines.filter(line => line.y <= point.y);
  const line = preceding.at(-1) ?? lines[0]!;
  // The caller uses normal caret navigation when pointing before existing content.
  if (point.y < line.y) return undefined;
  const paragraphs = Math.max(0,Math.floor((point.y-line.y)/line.height));
  const center = (bounds.left+bounds.right)/2;
  const alignment = Math.abs(point.x-center) <= 12 ? 'center' : bounds.right-point.x <= 12 ? 'right' : 'left';
  const precedingInk = line.fragments.filter(fragment => fragment.kind !== 'tab' && fragment.x + fragment.width <= point.x).at(-1);
  const offset = paragraphs ? line.endOffset : precedingInk?.endOffset ?? line.startOffset;
  return {paragraphElementId:line.paragraphElementId,offset,paragraphs,positionTwips:Math.round((point.x-bounds.left)*20),alignment};
}
