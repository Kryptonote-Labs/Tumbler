import {
  cartesianStack,
  chartValueCoordinate,
  layoutCartesianChart,
} from "./layout.ts";
import type { SupportedChartModel } from "./model.ts";
/** Rebind each plot to current host values and share domains only where the authored axes match. */
export function layoutCombinationChart(
  model: SupportedChartModel,
  width: number,
  height: number,
) {
  const plots = (model.plots ?? [model]).map(({ plots: _nested, ...plot }) => ({
    ...plot,
    series: plot.series.map(
      (series) => model.series.find((s) => s.index === series.index) ?? series,
    ),
  }));
  const layouts = plots.map((plot) =>
    layoutCartesianChart(
      {
        ...plot,
        axes: plot.axes.filter(
          (a) => !plot.axisIds || plot.axisIds.includes(a.id),
        ),
      },
      width,
      height,
    ),
  );
  const common = layoutCartesianChart(model, width, height);
  const rightAxis = plots.some((plot) =>
    plot.axes.some(
      (axis) =>
        axis.kind === "value" &&
        !axis.deleted &&
        axis.position === "right" &&
        plot.axisIds?.includes(axis.id),
    ),
  );
  const rect = {
    ...common.plot,
    width: Math.max(1, common.plot.width - (rightAxis ? 40 : 0)),
  };
  return plots.map((plot, i) => {
    const axis = plot.axes.find(
      (a) =>
        a.kind === "value" &&
        !a.deleted &&
        (!plot.axisIds || plot.axisIds.includes(a.id)),
    );
    const peers = plots.flatMap((p, j) =>
      p.axisIds?.at(-1) === plot.axisIds?.at(-1) ? [layouts[j]!] : [],
    );
    const minimum = axis?.minimum ?? Math.min(...peers.map((l) => l.minimum));
    const maximum = axis?.maximum ?? Math.max(...peers.map((l) => l.maximum));
    const coordinate = (value: number) =>
      chartValueCoordinate(
        value,
        minimum,
        maximum,
        plot.kind === "bar" ? rect.x : rect.y,
        plot.kind === "bar" ? rect.width : rect.height,
        plot.kind !== "bar",
      );
    return {
      model: plot,
      axis,
      minimum,
      maximum,
      plot: rect,
      categories: common.categories,
      coordinate,
      points: plot.series.map((_, s) =>
        common.categories.map((_, c) => {
          const point = cartesianStack(plot, s, c);
          return point
            ? { start: coordinate(point.start), end: coordinate(point.end) }
            : undefined;
        }),
      ),
    };
  });
}
