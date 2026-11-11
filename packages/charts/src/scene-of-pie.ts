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
import type { ChartMark, SceneContext } from './scene-marks.ts';

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
  const otherIndex = values.reduce((maximum, point) => Math.max(maximum, point.index), -1) + 1;
  const mainWidth = width * 0.63;
  const minorWidth = width - mainWidth;
  const minorHeight = height * Math.max(0.1, Math.min(2, (model.secondPieSize ?? 75) / 100));
  const secondarySeries = { ...first, values: { kind: 'number' as const, formula: undefined, formatCode: first.values?.formatCode, points: secondary } };
  const secondaryFractions = chartPieData(secondarySeries).fractions;
  const primaryPoints = [...primary, { index: otherIndex, value: other }], primaryFractions = new Map([...fractions, [otherIndex, otherFraction]]);
  const main = pieScene({ ...context, width: mainWidth, model: { ...model, kind: 'pie', legend: undefined, series: [{ ...first, values: { ...secondarySeries.values, points: primaryPoints } }] } }, {
    fractions: primaryFractions, slices: chartPieSlices(primaryPoints, primaryFractions, model.firstSliceAngle ?? model.threeD?.rotationY ?? 0),
  });
  const marks: ChartMark[] = [...main];
  if (model.splitType === 'bar') {
    const barWidth = minorWidth * 0.3, barHeight = height * 0.55;
    let top = (height - barHeight) / 2;
    for (const point of secondary) {
      const h = secondaryFractions.get(point.index)! * barHeight;
      marks.push({ kind: 'rect', x: mainWidth + (minorWidth - barWidth) / 2, y: top, width: barWidth, height: h, fill: chartPointColor(context, first, 0, point.index), ...chartPointFill(context, first, point.index, { x: mainWidth + (minorWidth - barWidth) / 2, y: top, width: barWidth, height: h }), ...chartPointStroke(context, first, 0, point.index, '#ffffff') });
      marks.push(...chartDataLabelMarks(context, first, 0, { index: point.index, x: mainWidth + minorWidth / 2, y: top + h / 2, category: String(indexChartSequence(first.categories).get(point.index) ?? point.index + 1), value: point.value, percent: fractions.get(point.index)! }));
      top += h;
    }
  } else {
    const frame = context.textFrame ?? { x: 0, y: 0, width, height };
    const minor = pieScene({ ...context, width: minorWidth, height: minorHeight, textFrame: { ...frame, x: frame.x + mainWidth, y: frame.y + (height - minorHeight) / 2 }, model: { ...model, kind: 'pie', title: undefined, legend: undefined, series: [secondarySeries] } }, { fractions });
    marks.push(...minor.map(mark => translateChartMark(mark, mainWidth, (height - minorHeight) / 2)));
  }
  marks.push(...chartLegendScene(context));
  return marks;
}
