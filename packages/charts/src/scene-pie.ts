import { indexChartSequence } from './indexed-data.ts';
import { layoutPieSlices, pieArcPath } from "./layout.ts";
import { legendGroup, type ChartMark, type SceneContext } from "./scene-marks.ts";
import { chartFont } from "./scene-style.ts";

const PADDING = 16;
const SLOT = 110;

/** Pie and doughnut charts. The legend lists categories of the first series, one entry per slice. */
export function pieScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const slices = layoutPieSlices(model);
  const count = slices.length;
  const position = model.legend?.position;
  const horizontal = position === "top" || position === "bottom";
  const titleHeight = model.title === undefined ? PADDING : 36;
  const columns = Math.max(1, Math.min(count, Math.floor((width - PADDING * 2) / SLOT)));
  const legendHeight = horizontal ? Math.ceil(count / columns) * 20 + 8 : 0;
  const sideWidth = Math.min(120, width * 0.25);
  const reserve = model.legend !== undefined && !model.legend.overlay;
  const left = PADDING + (reserve && position === "left" ? sideWidth : 0);
  const right = width - PADDING - (reserve && (position === "right" || position === "top-right") ? sideWidth : 0);
  const top = titleHeight + (reserve && position === "top" ? legendHeight : 0);
  const bottom = height - PADDING - (reserve && position === "bottom" ? legendHeight : 0);
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const radius = Math.max(1, Math.min(right - left, bottom - top) / 2);
  const hole = model.kind === "doughnut" ? radius * (model.holeSize ?? 50) / 100 : 0;
  const first = model.series[0]!;
  const marks: ChartMark[] = slices.map((slice, index) => ({
    kind: "path", d: pieArcPath(cx, cy, radius, slice.startAngle, slice.endAngle, hole), fill: context.color(first, index), stroke: "#ffffff", strokeWidth: 1,
  }));
  if (model.legend === undefined) return marks;

  const font = chartFont("legend", model.legend.textStyle, model, options.resolveColor);
  const categories = indexChartSequence(first.categories);
  const entries = slices.map((slice, index) => {
    const label = String(categories.get(slice.index) ?? slice.index + 1);
    if (!horizontal) return { label, x: position === "left" ? PADDING : width - sideWidth, y: titleHeight + 16 + index * 20, extent: 0 };
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    return {
      label,
      x: (width - rowCount * SLOT) / 2 + (index % columns) * SLOT,
      y: (position === "bottom" ? height - PADDING - legendHeight : titleHeight) + 16 + row * 20,
      extent: 15 + context.measure(label, font),
    };
  });
  // Horizontal rows centre their measured swatches and labels, not their spacing slots.
  const rows = new Map<number, { left: number; right: number }>();
  for (const entry of entries) {
    const row = rows.get(entry.y);
    rows.set(entry.y, { left: Math.min(row?.left ?? Infinity, entry.x), right: Math.max(row?.right ?? -Infinity, entry.x + entry.extent) });
  }
  marks.push(legendGroup(entries.map((entry, index): ChartMark[] => {
    const row = rows.get(entry.y)!;
    const x = entry.x + (horizontal ? width / 2 - (row.left + row.right) / 2 : 0);
    return [
      { kind: "rect", x, y: entry.y - 8, width: 10, height: 10, fill: context.color(first, index) },
      { kind: "text", text: entry.label, x: x + 15, y: entry.y, anchor: "start", font },
    ];
  })));
  return marks;
}
