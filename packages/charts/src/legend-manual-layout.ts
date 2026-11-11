import type { ChartLegendLayout } from './legend-layout.ts';
import { chartManualRect, type ChartManualLayout } from './manual-layout.ts';
import type { ChartFont } from './scene-style.ts';

type Measure = (text: string, font: ChartFont) => number;
type Wrap = (text: string, font: ChartFont, width: number, measure: Measure) => string[];

/** A native manual frame reflows entries while retaining automatic plot reservation. */
export function layoutManualChartLegend(automatic: ChartLegendLayout, layout: ChartManualLayout, width: number, height: number, measure: Measure, wrap: Wrap): ChartLegendLayout {
  const frame = chartManualRect(layout, { x: automatic.bounds.x - 5, y: automatic.bounds.y - 4, width: automatic.bounds.width + 10, height: automatic.bounds.height + 8 }, width, height);
  if (!frame.width || !frame.height || !automatic.entries.length) return { ...automatic, bounds: frame, entries: [], manual: true };
  const available = Math.max(1, frame.width - 10), labelX = automatic.labelX;
  const entries = automatic.entries.map(entry => {
    const lines = wrap(entry.label, entry.font, Math.max(1, available - labelX), measure);
    return { ...entry, lines, width: labelX + Math.max(0, ...lines.map(line => measure(line, entry.font))), inkHeight: entry.font.size * (1 + (lines.length - 1) * 1.2) };
  });
  const gap = Math.max(...entries.map(entry => entry.font.size)) * .3;
  const minimum = Math.min(...entries.map(entry => entry.width)), maximum = Math.max(...entries.map(entry => entry.width));
  // Every column needs at least the smallest entry; one must also hold the widest.
  let columns = Math.max(1, Math.min(entries.length, Math.floor((available - maximum) / (minimum + gap)) + 1)), widths: number[] = [];
  for (; columns > 0; columns--) {
    widths = Array.from({ length: columns }, () => 0);
    entries.forEach((entry, index) => { widths[index % columns] = Math.max(widths[index % columns]!, entry.width); });
    if (widths.reduce((sum, value) => sum + value, 0) + gap * (columns - 1) <= available || columns === 1) break;
  }
  const rows = Array.from({ length: Math.ceil(entries.length / columns) }, (_, index) => {
    const row = entries.slice(index * columns, (index + 1) * columns);
    const size = Math.max(...row.map(entry => entry.font.size));
    return { entries: row, size, height: Math.max(...row.map(entry => size - entry.font.size + entry.inkHeight)) };
  });
  const inkHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const verticalGap = Math.max(gap, (frame.height - 8 - inkHeight) / (rows.length + 1));
  const horizontalGap = Math.max(0, (available - widths.reduce((sum, value) => sum + value, 0) - gap * (columns - 1)) / (columns + 1));
  let top = frame.y + 4 + verticalGap;
  const placed = rows.flatMap(row => {
    let x = frame.x + 5 + horizontalGap;
    const y = top + row.size; top += row.height + verticalGap;
    return row.entries.map((entry, index) => {
      const point = { ...entry, x, y }; x += widths[index]! + gap + horizontalGap;
      return point;
    });
  });
  return { ...automatic, entries: placed, bounds: frame, rowsHeight: inkHeight + verticalGap * (rows.length + 1), manual: true };
}
