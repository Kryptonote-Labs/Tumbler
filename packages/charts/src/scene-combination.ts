import { chartTickLabel } from './tick-label.ts';
import { layoutBarBand } from "./bar-layout.ts";
import { layoutCombinationChart } from "./combination.ts";
import { legendMarks, line, type ChartMark, type SceneContext } from "./scene-marks.ts";
import { chartFont, chartStroke } from "./scene-style.ts";

/** Bar, column and line plots sharing one category axis, each on its authored value axis. */
export function combinationScene(context: SceneContext): ChartMark[] {
  const { model, width, height, options } = context;
  const resolve = options.resolveColor;
  const plots = layoutCombinationChart(model, width, height, context.measure);
  const marks: ChartMark[] = [];
  plots.forEach((plot, plotIndex) => {
    const horizontal = plot.model.kind === "bar";
    const count = Math.max(1, plot.categories.length);
    const band = (horizontal ? plot.plot.height : plot.plot.width) / count;
    const valueAxis = plot.model.axes.find(axis => axis.kind === 'value' && (!plot.model.axisIds || plot.model.axisIds.includes(axis.id)));
    // Each value axis labels its ticks once, from the first plot drawn on it.
    if (!valueAxis?.deleted && plots.findIndex(other => other.axis?.id === plot.axis?.id) === plotIndex) {
      const font = chartFont("tick", plot.axis?.textStyle, model, resolve);
      const gridline = chartStroke("gridline", plot.axis?.gridlineStyle, model, resolve);
      const right = plot.axis?.position === "right";
      for (const tick of plot.ticks) {
        const position = plot.coordinate(tick);
        const format = valueAxis?.numberFormatCode ?? plot.model.series.find(series => series.values?.formatCode !== undefined)?.values?.formatCode;
        const text = chartTickLabel(tick, format, options);
        marks.push(horizontal
          ? { kind: "text", text, x: position, y: plot.plot.y + plot.plot.height + 15, anchor: "middle", font }
          : { kind: "text", text, x: right ? plot.plot.x + plot.plot.width + 5 : plot.plot.x - 5, y: position + 4, anchor: right ? "start" : "end", font });
        if (valueAxis?.majorGridlines) marks.push(...(horizontal
          ? line(position, plot.plot.y, position, plot.plot.y + plot.plot.height, gridline)
          : line(plot.plot.x, position, plot.plot.x + plot.plot.width, position, gridline)));
      }
    }
    const bars = layoutBarBand(plot.model, band);
    plot.model.series.forEach((series, s) => {
      const points = plot.points[s]!;
      const seriesIndex = model.series.findIndex(item => item.index === series.index);
      if (plot.model.kind === "line") {
        const d = points.map((point, c) => point ? `${points[c - 1] ? "L" : "M"} ${plot.plot.x + (c + 0.5) * band} ${point.end}` : "").join(" ");
        marks.push({ kind: "path", d, stroke: context.color(series, seriesIndex, true), strokeWidth: 2 });
        return;
      }
      points.forEach((point, c) => {
        if (!point) return;
        const offset = c * band + bars.inset + s * bars.stride;
        const fill = context.color(series, seriesIndex);
        const start = Math.min(point.start, point.end), length = Math.abs(point.start - point.end);
        marks.push(horizontal
          ? { kind: "rect", x: start, y: plot.plot.y + offset, width: length, height: bars.thickness, fill }
          : { kind: "rect", x: plot.plot.x + offset, y: start, width: bars.thickness, height: length, fill });
      });
    });
  });
  const first = plots[0];
  const categoryAxis = first?.model.axes.find(axis => axis.kind === "category" && (!first.model.axisIds || first.model.axisIds.includes(axis.id)));
  if (first && !categoryAxis?.deleted) {
    const font = chartFont("category", categoryAxis?.textStyle, model, resolve);
    const count = Math.max(1, first.categories.length);
    const { plot } = first;
    first.categories.forEach((text, c) => marks.push(first.model.kind === "bar"
      ? { kind: "text", text, x: plot.x - 8, y: plot.y + (c + 0.5) * plot.height / count + 4, anchor: "end", font }
      : { kind: "text", text, x: plot.x + (c + 0.5) * plot.width / count, y: plot.y + plot.height + font.size + 5, anchor: first.categoryRotation < 0 ? "end" : first.categoryRotation > 0 ? "start" : "middle", rotate: first.categoryRotation, font }));
  }
  if (model.legend) {
    marks.push(...legendMarks(context, model.series.map((series, index) => ({
      label: series.title ?? `Series ${index + 1}`,
      swatch: (x: number, y: number): ChartMark => ({ kind: "rect", x, y: y - 8, width: 8, height: 8, fill: context.color(series, index) }),
    })), 12));
  }
  return marks;
}
