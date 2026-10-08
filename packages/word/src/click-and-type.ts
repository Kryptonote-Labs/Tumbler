import type { WordLayoutLine } from './layout.ts';

export interface WordClickAndTypeTarget {
  readonly paragraphElementId: number;
  readonly offset: number;
  readonly paragraphs: number;
  readonly positionTwips: number;
  readonly alignment: 'left' | 'center' | 'right';
  /** Snapped caret geometry in document points, shared by previews and editing intent. */
  readonly caret: { readonly x: number; readonly y: number; readonly height: number };
}

export interface WordClickAndTypeBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** Bottom-anchored stories cannot gain lower lines by appending empty paragraphs. */
  readonly verticalAnchor?: 'top' | 'bottom';
}

/** Snap blank-space intent to text rows and alignment zones. Existing ink keeps ordinary hit testing. */
export function wordClickAndTypeTarget(
  lines: readonly WordLayoutLine[],
  point: { x: number; y: number },
  bounds: WordClickAndTypeBounds,
): WordClickAndTypeTarget | undefined {
  if (!lines.length || ![point.x, point.y, bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return undefined;
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom || bounds.right <= bounds.left) return undefined;
  const inkAt = (line: WordLayoutLine, x: number) => line.fragments.some(fragment => fragment.kind !== 'tab' && x >= fragment.x && x <= fragment.x + fragment.width);
  if (lines.some(line => point.y >= line.y && point.y <= line.y + line.height && inkAt(line, point.x))) return undefined;

  const line = lines.reduce((nearest, candidate) =>
    Math.abs(point.y - candidate.y - candidate.height / 2) < Math.abs(point.y - nearest.y - nearest.height / 2) ? candidate : nearest);
  if (!(line.height > 0)) return undefined;
  const last = lines.reduce((lowest, candidate) => candidate.y > lowest.y ? candidate : lowest);
  const paragraphs = line === last && bounds.verticalAnchor !== 'bottom'
    ? Math.max(0, Math.floor((point.y - line.y) / line.height)) : 0;
  // 24 points gives forgiving zones at normal zoom. Cap their size so narrow cells retain gaps.
  const zone = Math.min(24, (bounds.right - bounds.left) / 6);
  const center = (bounds.left + bounds.right) / 2;
  const alignment = point.x - bounds.left <= zone ? 'left'
    : Math.abs(point.x - center) <= zone ? 'center'
    : bounds.right - point.x <= zone ? 'right' : 'left';
  const x = point.x - bounds.left <= zone ? bounds.left
    : alignment === 'center' ? center : alignment === 'right' ? bounds.right : point.x;
  if (!paragraphs && inkAt(line, x)) return undefined;
  const precedingInk = line.fragments.filter(fragment => fragment.kind !== 'tab' && fragment.x + fragment.width <= x).at(-1);
  const offset = paragraphs ? line.endOffset : precedingInk?.endOffset ?? line.startOffset;
  const reference = line.fragments.find(fragment => fragment.kind !== 'drawing');
  return {
    paragraphElementId: line.paragraphElementId,
    offset,
    paragraphs,
    positionTwips: Math.round((x - bounds.left) * 20),
    alignment,
    caret: { x, y: (reference?.y ?? line.y) + paragraphs * line.height, height: reference?.height ?? line.height },
  };
}
