import { translateChartMark } from './mark-translation.ts';
import { chartLegendScene } from './legend-scene.ts';
import { chartPointFill } from './fill-scene.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartPointColor } from './point-style.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { pieScene, pieChartFrame } from './scene-pie.ts';
import { chartPieData, chartPieSlices } from './pie-data.ts';
import { splitPieFrames, splitPieConnectors } from './split-pie-layout.ts';
import { chartStroke } from './scene-style.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';

export function ofPieScene(context: SceneContext): ChartMark[] {
  const { plot } = pieChartFrame(context);
  const { plotLayout: _layout, plotArea, title: _title, legend: _legend, ...model } = context.model;
  const content = splitPieScene({ ...context, width: plot.width, height: plot.height, textFrame: { x: plot.x, y: plot.y, width: context.width, height: context.height }, model: { ...model, title: undefined, legend: undefined, plotLayout: { target: 'inner', xMode: 'edge', yMode: 'edge', x: 0, y: 0, width: 1, height: 1 } } });
  const legend = chartLegendScene(context);
  return [...chartShapeMarks(context, plot, plotArea), ...content.map(mark => translateChartMark(mark, plot.x, plot.y)), ...legend];
}

function splitPieScene(context: SceneContext): ChartMark[] {
  const { model, width, height } = context;
  const first = model.series[0];
  if (!first) return [];
  const { points: values, fractions } = chartPieData(first);
  const position = model.splitPosition ?? 2;
  const count = [first.values, first.categories].reduce((count, sequence) => sequence?.points.reduce((maximum, point) => Math.max(maximum, point.index + 1), count) ?? count, 0);
  const secondary = values.filter(point => model.splitBy === 'cust' ? model.customSplit?.includes(point.index) === true : model.splitBy === 'val' ? point.value < position
    : model.splitBy === 'percent' ? fractions.get(point.index)! * 100 < position
    : point.index >= Math.max(0, count - Math.max(0, Math.floor(position))));
  const selected = new Set(secondary.map(point => point.index));
  const primary = values.filter(point => !selected.has(point.index));
  if (!secondary.length) return pieScene({ ...context, model: { ...model, kind: 'pie' } });
  const other = secondary.reduce((sum, point) => sum + Math.abs(point.value), 0);
  const otherFraction = secondary.reduce((sum, point) => sum + fractions.get(point.index)!, 0);
  const otherIndex = count;
  const frame = splitPieFrames(model, width, height);
  const secondarySeries = { ...first, values: { kind: 'number' as const, formula: undefined, formatCode: first.values?.formatCode, points: secondary } };
  const secondaryFractions = chartPieData(secondarySeries).fractions;
  const primaryPoints = [...primary, { index: otherIndex, value: other }], primaryFractions = new Map([...fractions, [otherIndex, otherFraction]]);
  const layers: { leaders: ChartMark[]; labels: ChartMark[] } = { leaders: [], labels: [] };
  const main = pieScene({ ...context, model: { ...model, kind: 'pie', legend: undefined, series: [{ ...first, values: { ...secondarySeries.values, points: primaryPoints } }] } }, {
    frame: frame.primary, fractions: primaryFractions, categories: new Map([[otherIndex, context.options.otherLabel ?? 'Other']]), layers,
    // The combined slice faces the secondary plot; ofPieChart has no firstSliceAng.
    slices: chartPieSlices(primaryPoints, primaryFractions, 90 + 180 * otherFraction),
  });
  const marks: ChartMark[] = [...main];
  if (model.splitType === 'bar') {
    const bar = frame.secondary;
    let bottom = bar.y + bar.height;
    for (const point of secondary) {
      const h = secondaryFractions.get(point.index)! * bar.height;
      const rect = { x: bar.x, y: bottom - h, width: bar.width, height: h };
      marks.push({ kind: 'rect', ...rect, fill: chartPointColor(context, first, 0, point.index), ...chartPointFill(context, first, point.index, rect), ...chartPointStroke(context, first, 0, point.index, '#ffffff') });
      layers.labels.push(...chartDataLabelMarks(context, first, 0, { index: point.index, x: bar.x + bar.width / 2, y: rect.y + h / 2, category: String(indexChartSequence(first.categories).get(point.index) ?? point.index + 1), value: point.value, percent: fractions.get(point.index)! }));
      bottom -= h;
    }
  } else {
    marks.push(...pieScene({ ...context, model: { ...model, kind: 'pie', title: undefined, legend: undefined, series: [secondarySeries] } }, { fractions, frame: frame.secondary, layers }));
  }
  if (model.seriesLines) {
    const stroke = chartStroke('axis', model.seriesLines, model, context.options.resolveColor);
    const explosion = context.pointFormat(first, otherIndex)?.explosion ?? first.explosion ?? 0;
    const combined = { ...frame.primary, x: frame.primary.x + frame.primary.width / 2 * explosion / 100 };
    for (const connector of splitPieConnectors(combined, frame.secondary, otherFraction, model.splitType === 'bar')) {
      marks.push(...line(connector.x1, connector.y1, connector.x2, connector.y2, stroke));
    }
  }
  return marks.concat(layers.leaders, layers.labels);
}
