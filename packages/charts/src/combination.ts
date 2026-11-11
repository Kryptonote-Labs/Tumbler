import { chartManualPlot, chartOuterPlot } from './manual-layout.ts';
import { chartStacks } from './indexed-data.ts';
import { assertChartSceneBudget } from './scene-budget.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import { chartAxisTicks, chartAxisCoordinate, chartLogarithmicScale } from "./axis-scale.ts";
import {
  layoutCartesianChart,
} from "./layout.ts";
import type { ChartAxis, SupportedChartModel } from "./model.ts";
/** Rebind each plot to current host values and share domains only where the authored axes match. */
export function layoutCombinationChart(
  model: SupportedChartModel,
  width: number,
  height: number,
  measure?: (text: string, font: ChartFont) => number,
) {
  assertChartSceneBudget(model);
  const plots = (model.plots ?? [model]).map(({ plots: _nested, ...plot }) => ({
    ...plot,
    axes: plot.axes.filter(axis => !plot.axisIds || plot.axisIds.includes(axis.id)),
    series: plot.series.map(
      (series) => model.series.find((s) => s.index === series.index) ?? series,
    ),
  }));
  const axisOwners = new Map<number, ChartAxis>();
  for (const plot of plots) for (const axis of plot.axes) if (!axisOwners.has(axis.id)) axisOwners.set(axis.id, axis);
  for (const axis of model.axes) if (!axisOwners.has(axis.id)) axisOwners.set(axis.id, axis);
  const frameModel = { ...model, axes: [...axisOwners.values()] };
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
      measure,
    ),
  );
  const common = layoutCartesianChart(frameModel, width, height, measure);
  const categoryDomain = {
    minimum: Math.min(...layouts.map(layout => layout.categoryDomain?.minimum ?? .5)),
    maximum: Math.max(...layouts.map(layout => layout.categoryDomain?.maximum ?? common.categories.length + .5)),
  };
  const rightAxis = plots.some((plot) =>
    plot.axes.some(
      (axis) =>
        axis.kind === "value" &&
        !axis.deleted &&
        axis.position === "right" &&
        plot.axisIds?.includes(axis.id),
    ),
  );
  const { plotLayout: _manual, ...automaticModel } = frameModel;
  const automatic = layoutCartesianChart(automaticModel, width, height, measure);
  const inner = { ...automatic.plot, width: Math.max(1, automatic.plot.width - (rightAxis ? 40 : 0)) };
  const outer = chartOuterPlot(model, { ...automatic, plot: inner }, measure ?? ((text, font) => text.length * font.size * .55));
  const rect = chartManualPlot(model.plotLayout, inner, { ...outer, width: outer.width + (rightAxis ? 40 : 0) }, width, height);
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
      chartAxisCoordinate(
        value,
        minimum,
        maximum,
        plot.kind === "bar" ? rect.x : rect.y,
        plot.kind === "bar" ? rect.width : rect.height,
        axis,
        plot.kind !== "bar",
      );
    const stacks = chartStacks(plot, common.categories.length);
    const ticks = axis?.logBase ? chartLogarithmicScale([minimum, maximum], { ...axis, minimum, maximum }).ticks : chartAxisTicks(minimum, maximum, axis?.majorUnit, {
      length: Math.max(1, plot.kind === 'bar' ? rect.width : rect.height),
      labelSize: chartFont('tick', axis?.textStyle, plot).size * (plot.kind === 'bar' ? 2 : 1),
    });
    return {
      model: plot,
      axis,
      minimum,
      maximum,
      ticks,
      layout: { ...layouts[i]!, plot: rect, categories: common.categories, stacks, minimum, maximum, ticks, categoryDomain, ...(common.categoryScale ? { categoryScale: common.categoryScale } : {}) },
      plot: rect,
      categories: common.categories,
      categoryRotation: common.categoryRotation,
      coordinate,
      points: plot.series.map((_, s) =>
        common.categories.map((_, c) => {
          const point = stacks[s]?.[c];
          return point
            ? { start: coordinate(point.start), end: coordinate(point.end) }
            : undefined;
        }),
      ),
    };
  });
}
