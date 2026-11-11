import type { ChartRect } from './layout.ts';
import type { ChartMark } from './scene-marks.ts';
import { chartPathBounds } from './path-bounds.ts';

/** Bind stroke brushes after layout, including curved paths and the outside half of an outline. */
export function chartStrokeBounds(marks: readonly ChartMark[], clip: ChartRect): readonly ChartMark[] {
  return marks.map(mark => {
    if (mark.kind === 'group') return { ...mark, marks: chartStrokeBounds(mark.marks, mark.clip ? intersection(clip, mark.clip) : clip) };
    if (!mark.strokeGradient || mark.kind === 'text') return mark;
    const bounds = mark.kind === 'rect' ? mark
      : mark.kind === 'circle' ? { x: mark.cx - mark.r, y: mark.cy - mark.r, width: mark.r * 2, height: mark.r * 2 }
      : mark.kind === 'line' ? { x: Math.min(mark.x1, mark.x2), y: Math.min(mark.y1, mark.y2), width: Math.abs(mark.x2 - mark.x1), height: Math.abs(mark.y2 - mark.y1) }
      : chartPathBounds(mark.d);
    if (!bounds) return mark;
    const width = (mark.kind === 'line' ? mark.width : mark.strokeWidth ?? 1) / 2;
    const strokeBounds = { x: bounds.x - width, y: bounds.y - width, width: bounds.width + width * 2, height: bounds.height + width * 2 };
    if (mark.strokeGradient.kind !== 'rectangular' && !(mark.strokeGradient.kind === 'radial' && !mark.strokeGradient.path)) return { ...mark, strokeBounds };
    const extent = width * (mark.kind === 'circle' || mark.kind === 'rect' ? 1 : mark.kind === 'path' && (mark.strokeJoin === undefined || mark.strokeJoin === 'miter') ? Math.max(1, mark.miterLimit ?? 10) : Math.SQRT2);
    const coverage = intersection(clip, { x: bounds.x - extent, y: bounds.y - extent, width: bounds.width + extent * 2, height: bounds.height + extent * 2 });
    if (coverage.width <= 0 || coverage.height <= 0) return { ...mark, strokeBounds };
    return { ...mark, strokeBounds, strokeBrushBounds: coverage };
  });
}

function intersection(a: ChartRect, b: ChartRect): ChartRect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
