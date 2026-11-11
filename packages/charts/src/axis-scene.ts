import { chartDisplayUnitMarks } from './display-unit-scene.ts';
import { positionChartText } from './text-position.ts';
import { chartAxisFormat, chartCategoryAxisLabels } from './axis-labels.ts';
import { xyGeometry } from './xy-geometry.ts';
import type { ChartAxis } from './model.ts';
import { chartMinorTicks } from './axis-scale.ts';
import { chartFont, chartStroke } from './scene-style.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';
import { chartTickLabel } from './tick-label.ts';
import { cartesianAxisPositions, xyAxisPosition } from './axis-positions.ts';
import type { CartesianChartLayout } from './layout.ts';

function ticks(axis: ChartAxis | undefined, minor: boolean, position: number, spine: number, horizontal: boolean, side: number, style: ReturnType<typeof chartStroke>): ChartMark[] {
  const type = (minor ? axis?.minorTickMark : axis?.majorTickMark) ?? 'none';
  if (type === 'none') return [];
  const size = minor ? 3 : 5;
  const first = spine + (type === 'in' || type === 'cross' ? -side * size : 0);
  const last = spine + (type === 'out' || type === 'cross' ? side * size : 0);
  return horizontal ? line(position, first, position, last, style) : line(first, position, last, position, style);
}

/** Categorical plots use the authored crossing, tick, label-side and display-unit settings. */
export function cartesianAxisMarks(context: SceneContext, layout: CartesianChartLayout): ChartMark[] {
  const { model, options } = context;
  const { plot, minimum, maximum } = layout;
  const { horizontal, valueAxis, categoryAxis, count, value, category, dateCategory, numericPosition, categoryPosition, numericLabelEdge, labelSide, categoryLabelEdge: labelEdge, categoryLabelDirection: labelDirection } = cartesianAxisPositions(model, layout);
  const marks: ChartMark[] = [];
  const valueLine = chartStroke('axis', valueAxis?.lineStyle, model, options.resolveColor);
  const categoryLine = chartStroke('axis', categoryAxis?.lineStyle, model, options.resolveColor);
  const gridline = chartStroke('gridline', valueAxis?.gridlineStyle, model, options.resolveColor);
  const font = chartFont('tick', valueAxis?.textStyle, model, options.resolveColor);
  const format = chartAxisFormat(model, valueAxis);
  if (valueAxis && !valueAxis.deleted) {
    const drawTick = (tick: number, minor: boolean) => {
      const at = value(tick);
      if (minor ? valueAxis?.minorGridlines : valueAxis?.majorGridlines) {
        const style = minor ? chartStroke('gridline', valueAxis?.minorGridlineStyle, model, options.resolveColor) : gridline;
        marks.push(...(horizontal ? line(at, plot.y, at, plot.y + plot.height, style) : line(plot.x, at, plot.x + plot.width, at, style)));
      }
      marks.push(...ticks(valueAxis, minor, at, categoryPosition, horizontal, labelSide, valueLine));
      if (minor || valueAxis?.tickLabelPosition === 'none') return;
      const text = chartTickLabel(tick / (valueAxis?.displayUnit ?? 1), format, options);
      marks.push(horizontal ? { kind: 'text', text, x: at, y: numericLabelEdge + (labelSide > 0 ? font.size + 5 : -5), anchor: 'middle', font }
        : { kind: 'text', text, x: numericLabelEdge + labelSide * 6, y: at + font.size * .3, anchor: labelSide > 0 ? 'start' : 'end', font });
    };
    if (valueAxis && (valueAxis.minorGridlines || valueAxis.minorTickMark !== undefined && valueAxis.minorTickMark !== 'none')) chartMinorTicks(minimum, maximum, valueAxis, layout.ticks).forEach(tick => drawTick(tick, true));
    layout.ticks.forEach(tick => drawTick(tick, false));
    marks.push(...(horizontal ? line(plot.x, categoryPosition, plot.x + plot.width, categoryPosition, valueLine) : line(categoryPosition, plot.y, categoryPosition, plot.y + plot.height, valueLine)));
    if (valueAxis?.title) {
      const titleFont = chartFont('axisTitle', valueAxis.titleStyle, model, options.resolveColor);
      marks.push(...positionChartText(context, [horizontal ? { kind: 'text', text: valueAxis.title, x: plot.x + plot.width / 2, y: context.height - titleFont.size / 2, anchor: 'middle', font: titleFont }
        : { kind: 'text', text: valueAxis.title, x: labelSide > 0 ? context.width - titleFont.size : titleFont.size, y: plot.y + plot.height / 2, rotate: -90, anchor: 'middle', font: titleFont }], valueAxis.titleLayout));
    }
    if (valueAxis) marks.push(...chartDisplayUnitMarks(context, valueAxis, { x: plot.x, y: plot.y - 6, anchor: 'start' }));
  }
  if (!categoryAxis?.deleted) {
    marks.push(...(horizontal ? line(numericPosition, plot.y, numericPosition, plot.y + plot.height, categoryLine) : line(plot.x, numericPosition, plot.x + plot.width, numericPosition, categoryLine)));
    const categoryFont = chartFont('category', categoryAxis?.textStyle, model, options.resolveColor);
    const skip = categoryAxis?.tickLabelSkip ?? (horizontal ? Math.max(1, Math.ceil(count * categoryFont.size * 1.5 / plot.height)) : 1);
    const distance = 5 + categoryFont.size * (categoryAxis?.labelOffset ?? 100) / 100;
    const texts = chartCategoryAxisLabels(model, layout, options);
    const categoryTicks = layout.categoryScale ? layout.categoryScale.ticks.map((value, index) => ({ text: texts[index]!, position: dateCategory(value) })) : texts.map((text, index) => ({ text, position: category(index, model.kind !== 'area') }));
    categoryTicks.forEach(({ text, position: at }, index) => {
      if (index % (categoryAxis?.tickMarkSkip ?? 1) === 0) marks.push(...ticks(categoryAxis, false, at, numericPosition, !horizontal, horizontal ? -labelDirection : labelDirection, categoryLine));
      if (index % skip || categoryAxis?.tickLabelPosition === 'none') return;
      marks.push(horizontal ? { kind: 'text', text, x: labelEdge - labelDirection * 7, y: at + categoryFont.size * .3, anchor: labelDirection > 0 ? 'end' : 'start', font: categoryFont }
        : { kind: 'text', text, x: at, y: labelEdge + labelDirection * distance, anchor: layout.categoryRotation < 0 ? 'end' : layout.categoryRotation > 0 ? 'start' : 'middle', rotate: layout.categoryRotation, font: categoryFont });
    });
    if (categoryAxis?.title) {
      const titleFont = chartFont('axisTitle', categoryAxis.titleStyle, model, options.resolveColor);
      marks.push(...positionChartText(context, [horizontal ? { kind: 'text', text: categoryAxis.title, x: titleFont.size, y: plot.y + plot.height / 2, rotate: -90, anchor: 'middle', font: titleFont }
        : { kind: 'text', text: categoryAxis.title, x: plot.x + plot.width / 2, y: context.height - titleFont.size / 2, anchor: 'middle', font: titleFont }], categoryAxis.titleLayout));
    }
  }
  return marks;
}

/** Both XY axes use numeric scales, with independent direction, crossing and tick styles. */
export function xyAxisMarks(context: SceneContext, layout: import('./layout.ts').ScatterChartLayout): ChartMark[] {
  const { model, options } = context;
  const { plot } = layout;
  const { x, y } = xyGeometry(model, layout);
  const marks: ChartMark[] = [];
  for (const horizontal of [true, false]) {
    const { axis, spine, side, edge } = xyAxisPosition(model, layout, horizontal);
    if (axis?.deleted) continue;
    const minimum = horizontal ? layout.xMinimum : layout.yMinimum, maximum = horizontal ? layout.xMaximum : layout.yMaximum;
    const positions = horizontal ? layout.xTicks : layout.yTicks;
    const coordinate = horizontal ? x : y;
    const axisLine = chartStroke('axis', axis?.lineStyle, model, options.resolveColor);
    const font = chartFont('tick', axis?.textStyle, model, options.resolveColor);
    const format = chartAxisFormat(model, axis, horizontal ? 'xValues' : 'values');
    const drawTick = (tick: number, minor: boolean) => {
      const position = coordinate(tick);
      if (minor ? axis?.minorGridlines : axis?.majorGridlines) {
        const style = chartStroke('gridline', minor ? axis?.minorGridlineStyle : axis?.gridlineStyle, model, options.resolveColor);
        marks.push(...(horizontal ? line(position, plot.y, position, plot.y + plot.height, style) : line(plot.x, position, plot.x + plot.width, position, style)));
      }
      marks.push(...ticks(axis, minor, position, spine, horizontal, side, axisLine));
      if (minor || axis?.tickLabelPosition === 'none') return;
      const text = chartTickLabel(tick / (axis?.displayUnit ?? 1), format, options);
      marks.push(horizontal ? { kind: 'text', text, x: position, y: edge + (side > 0 ? font.size + 5 : -5), anchor: 'middle', font }
        : { kind: 'text', text, x: edge + side * 6, y: position + font.size * .3, anchor: side > 0 ? 'start' : 'end', font });
    };
    if (axis && (axis.minorGridlines || axis.minorTickMark !== undefined && axis.minorTickMark !== 'none')) chartMinorTicks(minimum, maximum, axis, positions).forEach(value => drawTick(value, true));
    positions.forEach(value => drawTick(value, false));
    marks.push(...(horizontal ? line(plot.x, spine, plot.x + plot.width, spine, axisLine) : line(spine, plot.y, spine, plot.y + plot.height, axisLine)));
    if (axis?.title !== undefined) {
      const font = chartFont('axisTitle', axis.titleStyle, model, options.resolveColor);
      marks.push(...positionChartText(context, [horizontal ? { kind: 'text', text: axis.title, x: plot.x + plot.width / 2, y: context.height - 4, anchor: 'middle', font }
        : { kind: 'text', text: axis.title, x: side > 0 ? context.width - font.size : font.size, y: plot.y + plot.height / 2, anchor: 'middle', rotate: -90, font }], axis.titleLayout));
    }
    if (axis) marks.push(...chartDisplayUnitMarks(context, axis, { x: horizontal ? plot.x + plot.width : plot.x, y: horizontal ? plot.y + plot.height + font.size * 2.5 : plot.y - 6, anchor: 'end' }));
  }
  return marks;
}
