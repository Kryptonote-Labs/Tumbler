import { chartDisplayUnitMarks } from './display-unit-scene.ts';
import { chartAxisTitleMarks } from './axis-title-scene.ts';
import { chartAxisTitleRotation, chartAxisTitleSide } from './axis-title-space.ts';
import { chart3DCorner } from './three-d-walls.ts';
import { chartAxisCrossing, chartMinorTicks } from './axis-scale.ts';
import { chartFont, chartStroke, type ChartStroke } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';
import type { ChartAxis } from './model.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { threeDGeometry } from './three-d-geometry.ts';
import type { chartProjection } from './projection.ts';

type Point = { readonly x: number; readonly y: number };
function normal(first: Point, last: Point, desired: Point): Point {
  const dx = last.x - first.x, dy = last.y - first.y, length = Math.hypot(dx, dy) || 1;
  const x = -dy / length, y = dx / length, sign = x * desired.x + y * desired.y < 0 ? -1 : 1;
  return { x: x * sign, y: y * sign };
}
function tick(point: Point, direction: Point, type: ChartAxis['majorTickMark'], style: ChartStroke, minor = false): ChartMark[] {
  if (!type || type === 'none') return [];
  const length = minor ? 3 : 5, inside = type === 'in' || type === 'cross' ? -length : 0, outside = type === 'out' || type === 'cross' ? length : 0;
  return line(point.x + direction.x * inside, point.y + direction.y * inside, point.x + direction.x * outside, point.y + direction.y * outside, style);
}

/** All three axes use the same camera and source scale as their data geometry. */
export function threeDAxisMarks(context: SceneContext, layout: CartesianChartLayout, geometry: ReturnType<typeof threeDGeometry>, project: ReturnType<typeof chartProjection>) {
  const { model, options } = context, { valueAxis, categoryAxis, horizontal, point } = geometry;
  const depthAxis = model.axes.find(axis => axis.kind === 'series');
  const grids: ChartMark[] = [], marks: ChartMark[] = [];
  const { nearZ: near, farZ: far, farX } = chart3DCorner(project);
  const defaultEdge = valueAxis?.position === 'right' || valueAxis?.position === 'top' ? 1 : 0;
  const maximumEdge = categoryAxis?.crosses === 'max' || (categoryAxis?.crosses === undefined || categoryAxis.crosses === 'autoZero') && defaultEdge === 1;
  const categoryEdge = maximumEdge !== geometry.categoryReversed ? 1 : 0;
  const categoryCross = categoryAxis?.crossesAt === undefined ? categoryEdge : categoryAxis.dateAxis ? geometry.dateCategory(categoryAxis.crossesAt) : valueAxis?.crossBetween === 'midCat' ? geometry.category(categoryAxis.crossesAt - 1) : geometry.categoryBoundary(categoryAxis.crossesAt - 1);
  const numericCross = chartAxisCrossing(valueAxis, layout.minimum, layout.maximum);
  const categoryStart = project(point(0, numericCross, near)), categoryEnd = project(point(1, numericCross, near));
  const valueStart = project(point(categoryCross, layout.minimum, near)), valueEnd = project(point(categoryCross, layout.maximum, near));
  const valueDirection = normal(valueStart, valueEnd, horizontal ? { x: 0, y: valueAxis?.position === 'top' ? -1 : 1 } : { x: valueAxis?.position === 'right' ? 1 : -1, y: 0 });
  const categoryDirection = normal(categoryStart, categoryEnd, horizontal ? { x: categoryAxis?.position === 'right' ? 1 : -1, y: 0 } : { x: 0, y: categoryAxis?.position === 'top' ? -1 : 1 });
  const valueLine = chartStroke('axis', valueAxis?.lineStyle, model, options.resolveColor), categoryLine = chartStroke('axis', categoryAxis?.lineStyle, model, options.resolveColor);
  if (valueAxis && !valueAxis.deleted) {
    const font = chartFont('tick', valueAxis.textStyle, model, options.resolveColor);
    marks.push(...line(valueStart.x, valueStart.y, valueEnd.x, valueEnd.y, valueLine));
    const draw = (value: number, minor: boolean) => {
      const position = project(point(categoryCross, value, near));
      if (minor ? valueAxis.minorGridlines : valueAxis.majorGridlines) {
        const edge = horizontal ? 0 : farX;
        const a = project(point(edge, value, near)), b = project(point(edge, value, far)), c = project(point(1 - edge, value, far));
        const style = chartStroke('gridline', minor ? valueAxis.minorGridlineStyle : valueAxis.gridlineStyle, model, options.resolveColor);
        grids.push(...line(a.x, a.y, b.x, b.y, style), ...line(b.x, b.y, c.x, c.y, style));
      }
      marks.push(...tick(position, valueDirection, minor ? valueAxis.minorTickMark : valueAxis.majorTickMark, valueLine, minor));
      if (minor || valueAxis.tickLabelPosition === 'none') return;
      const edge = valueAxis.tickLabelPosition === 'high' ? 1 : valueAxis.tickLabelPosition === 'low' ? 0 : categoryCross;
      const anchor = project(point(edge, value, near)), direction = edge === categoryCross ? valueDirection : normal(valueStart, valueEnd, horizontal ? { x: 0, y: edge ? -1 : 1 } : { x: edge ? 1 : -1, y: 0 });
      marks.push({ kind: 'text', text: chartTickLabel(value / (valueAxis.displayUnit ?? 1), valueAxis.numberFormatCode, options), x: anchor.x + direction.x * 6, y: anchor.y + direction.y * (horizontal ? font.size : 0) + font.size * .3, anchor: horizontal ? 'middle' : direction.x < 0 ? 'end' : 'start', font });
    };
    layout.ticks.forEach(value => draw(value, false));
    if (valueAxis.minorGridlines || valueAxis.minorTickMark && valueAxis.minorTickMark !== 'none') chartMinorTicks(layout.minimum, layout.maximum, valueAxis, layout.ticks).forEach(value => draw(value, true));
    marks.push(...chartDisplayUnitMarks(context, valueAxis, { x: valueEnd.x - 4, y: valueEnd.y - 8, anchor: 'end' }));
  }
  if (valueAxis?.title) {
    const titleFont = chartFont('axisTitle', valueAxis.titleStyle, model, options.resolveColor);
    marks.push(...chartAxisTitleMarks(context, valueAxis, [{ kind: 'text', text: valueAxis.title, x: (valueStart.x + valueEnd.x) / 2 + valueDirection.x * 42, y: (valueStart.y + valueEnd.y) / 2 + valueDirection.y * 36, anchor: 'middle', rotate: chartAxisTitleRotation(model, valueAxis), font: titleFont }], chartAxisTitleSide(model, valueAxis).side));
  }
  if (!categoryAxis?.deleted) {
    const font = chartFont('category', categoryAxis?.textStyle, model, options.resolveColor), skip = categoryAxis?.tickLabelSkip ?? 1;
    marks.push(...line(categoryStart.x, categoryStart.y, categoryEnd.x, categoryEnd.y, categoryLine));
    const entries = layout.categoryScale ? layout.categoryScale.ticks.map(value => ({ coordinate: geometry.dateCategory(value), text: chartTickLabel(value, categoryAxis?.numberFormatCode ?? 'm/d/yyyy', options) })) : layout.categories.map((text, index) => ({ coordinate: geometry.category(index, model.kind !== 'area' && model.kind !== 'surface'), text }));
    entries.forEach((entry, index) => {
      const at = project(point(entry.coordinate, numericCross, near));
      if (index % (categoryAxis?.tickMarkSkip ?? 1) === 0) marks.push(...tick(at, categoryDirection, categoryAxis?.majorTickMark, categoryLine));
      if (index % skip || categoryAxis?.tickLabelPosition === 'none') return;
      const edge = categoryAxis?.tickLabelPosition === 'high' ? layout.maximum : categoryAxis?.tickLabelPosition === 'low' ? layout.minimum : numericCross;
      const direction = categoryAxis?.tickLabelPosition === 'high' || categoryAxis?.tickLabelPosition === 'low' ? normal(categoryStart, categoryEnd, horizontal ? { x: geometry.value(edge) > .5 ? 1 : -1, y: 0 } : { x: 0, y: geometry.value(edge) > .5 ? -1 : 1 }) : categoryDirection;
      const anchor = project(point(entry.coordinate, edge, near));
      marks.push({ kind: 'text', text: entry.text, x: anchor.x + direction.x * 7, y: anchor.y + direction.y * font.size * (categoryAxis?.labelOffset ?? 100) / 100 + font.size * .4, anchor: horizontal ? direction.x < 0 ? 'end' : 'start' : 'middle', ...(categoryAxis?.labelRotation === undefined ? {} : { rotate: categoryAxis.labelRotation }), font });
    });
  }
  if (categoryAxis?.title) marks.push(...chartAxisTitleMarks(context, categoryAxis, [{ kind: 'text', text: categoryAxis.title, x: (categoryStart.x + categoryEnd.x) / 2 + categoryDirection.x * 34, y: (categoryStart.y + categoryEnd.y) / 2 + categoryDirection.y * 34, anchor: 'middle', rotate: chartAxisTitleRotation(model, categoryAxis), font: chartFont('axisTitle', categoryAxis.titleStyle, model, options.resolveColor) }], chartAxisTitleSide(model, categoryAxis).side));
  if (depthAxis && (model.grouping === 'standard' || model.kind === 'surface')) {
    const edge = depthAxis.position === 'left' ? 0 : 1, floor = valueAxis?.reversed ? layout.maximum : layout.minimum;
    const depthPoint = (depth: number) => horizontal ? point(0, (edge === 1) !== !!valueAxis?.reversed ? layout.maximum : layout.minimum, depth) : point(edge, floor, depth);
    const a = project(depthPoint(0)), b = project(depthPoint(1)), style = chartStroke('axis', depthAxis.lineStyle, model, options.resolveColor), font = chartFont('category', depthAxis.textStyle, model, options.resolveColor);
    const direction = normal(a, b, { x: edge ? 1 : -1, y: 1 });
    if (!depthAxis.deleted) marks.push(...line(a.x, a.y, b.x, b.y, style));
    if (!depthAxis.deleted) model.series.forEach((series, index) => {
      const band = geometry.depthBand(index), depth = model.kind === 'surface' ? geometry.depth(index / Math.max(1, model.series.length - 1)) : (band.start + band.end) / 2;
      const at = project(depthPoint(depth));
      if (index % (depthAxis.tickMarkSkip ?? 1) === 0) marks.push(...tick(at, direction, depthAxis.majorTickMark, style));
      if (depthAxis.tickLabelPosition !== 'none' && index % (depthAxis.tickLabelSkip ?? 1) === 0) marks.push({ kind: 'text', text: series.title ?? `Series ${index + 1}`, x: at.x + direction.x * 8, y: at.y + direction.y * font.size + font.size * .3, anchor: edge ? 'start' : 'end', font });
    });
    if (depthAxis.title) marks.push(...chartAxisTitleMarks(context, depthAxis, [{ kind: 'text', text: depthAxis.title, x: (a.x + b.x) / 2 + direction.x * 30, y: (a.y + b.y) / 2 + direction.y * 30, anchor: 'middle', rotate: chartAxisTitleRotation(model, depthAxis), font: chartFont('axisTitle', depthAxis.titleStyle, model, options.resolveColor) }], chartAxisTitleSide(model, depthAxis).side));
  }
  return { grids, marks };
}
