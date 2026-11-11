import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartLineStyle, ChartShapeStyle, SupportedChartModel } from './model.ts';
import { parseChartLine, parseChartShapeStyle } from './formatting-parser.ts';
import { chartAxisCrossing } from './axis-scale.ts';
import { cartesianGeometry } from './cartesian-geometry.ts';
import type { CartesianChartLayout } from './layout.ts';
import { chartStroke } from './scene-style.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';

export interface ChartUpDownBars {
  readonly gapWidth: number;
  readonly upBars?: ChartShapeStyle;
  readonly downBars?: ChartShapeStyle;
}
const child = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);

/** Read native plot lines and up/down bars without losing explicit hidden strokes. */
export function parsePlotDecorations(plot: LosslessXmlElement, c: string, a: string): Pick<SupportedChartModel, 'dropLines' | 'highLowLines' | 'seriesLines' | 'upDownBars'> {
  const drop = child(plot, c, 'dropLines'), highLow = child(plot, c, 'hiLowLines'), series = child(plot, c, 'serLines'), bars = child(plot, c, 'upDownBars');
  const stroke = (parent: LosslessXmlElement) => parseChartLine(child(parent, c, 'spPr'), a) ?? {};
  const width = child(bars, c, 'gapWidth')?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
  const gapWidth = width?.endsWith('%') ? Number(width.slice(0, -1)) : Number(width ?? 150);
  const upBars = parseChartShapeStyle(child(child(bars, c, 'upBars'), c, 'spPr'), a), downBars = parseChartShapeStyle(child(child(bars, c, 'downBars'), c, 'spPr'), a);
  return { ...(drop ? { dropLines: stroke(drop) } : {}), ...(highLow ? { highLowLines: stroke(highLow) } : {}), ...(series ? { seriesLines: stroke(series) } : {}),
    ...(bars ? { upDownBars: { gapWidth, ...(upBars ? { upBars } : {}), ...(downBars ? { downBars } : {}) } } : {}) };
}

/** Decorations use the same value/date/reverse projection as the plotted data. */
export function cartesianDecorationMarks(context: SceneContext, layout: CartesianChartLayout): ChartMark[] {
  const { model } = context;
  if (!model.dropLines && !model.highLowLines && !model.upDownBars) return [];
  const geometry = cartesianGeometry(model, layout);
  const coordinate = (category: number, value: number) => geometry.horizontal ? { x: geometry.value(value), y: geometry.category(category, model.kind !== 'area') } : { x: geometry.category(category, model.kind !== 'area'), y: geometry.value(value) };
  const marks: ChartMark[] = [];
  const stroke = (style: ChartLineStyle) => chartStroke('axis', style, model, context.options.resolveColor);
  for (let index = 0; index < layout.categories.length; index++) {
    const values = layout.stacks.map(series => series[index]?.end);
    const finite = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (model.highLowLines && finite.length) {
      const first = coordinate(index, Math.min(...finite)), last = coordinate(index, Math.max(...finite));
      marks.push(...line(first.x, first.y, last.x, last.y, stroke(model.highLowLines)));
    }
    if (model.dropLines) for (const value of finite) {
      const first = coordinate(index, chartAxisCrossing(geometry.valueAxis, layout.minimum, layout.maximum)), last = coordinate(index, value);
      marks.push(...line(first.x, first.y, last.x, last.y, stroke(model.dropLines)));
    }
    const bars = model.upDownBars, first = values[0], last = values.at(-1);
    if (bars && first !== undefined && last !== undefined && model.series.length > 1) {
      if (!Number.isFinite(bars.gapWidth) || bars.gapWidth < 0 || bars.gapWidth > 500) throw new RangeError('Invalid up/down bar gap.');
      const width = geometry.band / (1 + bars.gapWidth / 100), a = coordinate(index, first), b = coordinate(index, last);
      const rect = geometry.horizontal ? { x: Math.min(a.x, b.x), y: a.y - width / 2, width: Math.max(1, Math.abs(a.x - b.x)), height: width }
        : { x: a.x - width / 2, y: Math.min(a.y, b.y), width, height: Math.max(1, Math.abs(a.y - b.y)) };
      marks.push(...chartShapeMarks(context, rect, last >= first ? bars.upBars : bars.downBars, { fill: last >= first ? '#ffffff' : '#595959', stroke: '#595959' }));
    }
  }
  return marks;
}
