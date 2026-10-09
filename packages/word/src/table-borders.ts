import type { WordCellBorders, WordTableBorder, WordTableBorders } from './table-format.ts';

export interface WordLayoutTableBorder {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly border: WordTableBorder;
}
interface Cell {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly borders?: WordCellBorders;
}
/** Split shared edges at merged-cell boundaries and paint each segment exactly once. */
export function resolveTableBorders(cells: readonly Cell[], table: { x: number; y: number; width: number; height: number }, defaults: WordTableBorders = {}): WordLayoutTableBorder[] {
  type Edge = { start: number; end: number; border: WordTableBorder; direct: boolean };
  const groups = new Map<string, { position: number; orientation: 'horizontal' | 'vertical'; edges: Edge[] }>();
  for (const cell of cells) for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const horizontal = side === 'top' || side === 'bottom';
    const position = horizontal ? cell.y + (side === 'bottom' ? cell.height : 0) : cell.x + (side === 'right' ? cell.width : 0);
    const outer = Math.abs(position - (horizontal ? table.y : table.x)) < 1e-6 || Math.abs(position - (horizontal ? table.y + table.height : table.x + table.width)) < 1e-6;
    const direct = cell.borders?.[side];
    const border = direct ?? defaults[outer ? side : horizontal ? 'insideH' : 'insideV'];
    if (!border) continue;
    const key = `${horizontal}:${position.toFixed(6)}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = { position, orientation: horizontal ? 'horizontal' : 'vertical', edges: [] });
    const start = horizontal ? cell.x : cell.y;
    group.edges.push({ start, end: start + (horizontal ? cell.width : cell.height), border, direct: !!direct });
  }
  const result: WordLayoutTableBorder[] = [];
  const rank = { none: 0, single: 1, double: 3, dotted: 4, dashed: 5 };
  for (const { position, orientation, edges } of groups.values()) {
    const stops = [...new Set(edges.flatMap(e => [e.start, e.end]))].sort((a,b) => a-b);
    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i]!, end = stops[i+1]!;
      const candidates = edges.filter(e => e.start <= start + 1e-6 && e.end >= end - 1e-6);
      const direct = candidates.filter(e => e.direct);
      const selected = (direct.length ? direct : candidates).filter(e => e.border.style !== 'none' && e.border.widthPoints > 0).sort((a,b) =>
        b.border.widthPoints * rank[b.border.style] - a.border.widthPoints * rank[a.border.style] || rank[b.border.style] - rank[a.border.style] || a.border.color.localeCompare(b.border.color))[0];
      if (selected) result.push({ x: orientation === 'horizontal' ? start : position, y: orientation === 'horizontal' ? position : start, length: end-start, orientation, border: selected.border });
    }
  }
  return result;
}
