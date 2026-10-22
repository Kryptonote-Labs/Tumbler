import type { WordLayoutLine, WordLayoutTable } from './layout.ts';

/** Page-relative content clip in points. Nested cells intersect their ancestors. */
export interface WordContentBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function intersectWordContentBounds(a: WordContentBounds, b: WordContentBounds): WordContentBounds {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

export interface WordClippedLine {
  readonly line: WordLayoutLine;
  readonly clip?: WordContentBounds;
}

/** Keep original lines and text offsets, including hidden text for keyboard selection. */
export function wordTableLinesWithClips(tables: readonly WordLayoutTable[], ancestor?: WordContentBounds): WordClippedLine[] {
  return tables.flatMap(table => table.cells.flatMap(cell => {
    const clip = ancestor ? intersectWordContentBounds(ancestor, cell) : { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
    return [...cell.lines.map(line => ({ line, clip })), ...wordTableLinesWithClips(cell.tables, clip)];
  }));
}

/** Empty lines still have a caret; fully clipped lines have no pointer target. */
export function wordVisibleLineBounds({ line, clip }: WordClippedLine): WordContentBounds | undefined {
  // A right-aligned empty caret can sit exactly on the cell's end boundary.
  const x = clip && line.width === 0 && line.x === clip.x + clip.width ? line.x - 1 : line.x;
  const bounds = { x, y: line.y, width: Math.max(1, line.width), height: line.height };
  const visible = clip ? intersectWordContentBounds(bounds, clip) : bounds;
  return visible.width > 0 && visible.height > 0 ? visible : undefined;
}
