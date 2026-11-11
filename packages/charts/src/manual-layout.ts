import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { chartAxisFormat, chartCategoryAxisLabels } from './axis-labels.ts';
import { cartesianAxisPositions, xyAxisPosition } from './axis-positions.ts';
import type { CartesianChartLayout, ChartRect, ScatterChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';
import { chartFont, type ChartFont } from './scene-style.ts';
import { chartTickLabel } from './tick-label.ts';

export interface ChartManualLayout {
  readonly target?: 'inner' | 'outer';
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly xMode?: 'edge' | 'factor';
  readonly yMode?: 'edge' | 'factor';
  readonly widthMode?: 'edge' | 'factor';
  readonly heightMode?: 'edge' | 'factor';
}

/** Native chart fractions stay relative to the chart, including factor-mode position offsets. */
export function parseChartManualLayout(owner: LosslessXmlElement | undefined, namespace: string): ChartManualLayout | undefined {
  const child = (node: LosslessXmlElement | undefined, name: string) => node?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === namespace && child.localName === name);
  const manual = child(child(owner, 'layout'), 'manualLayout');
  if (!manual) return undefined;
  const value = (name: string) => child(manual, name)?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
  const mode = (name: string) => value(name) === 'edge' ? 'edge' as const : 'factor' as const;
  const xMode = mode('xMode'), yMode = mode('yMode');
  const number = (name: string) => { const raw = value(name); return raw === undefined ? undefined : raw.trim() ? Number(raw) : NaN; };
  const x = number('x'), y = number('y'), width = number('w'), height = number('h');
  const text = owner && ['title', 'dLbl', 'dispUnitsLbl', 'trendlineLbl'].includes(owner.localName);
  // MS-OI29500 21.2.2.104: Office requires paired text coordinates and complete plot/legend frames.
  if (text && (x === undefined) !== (y === undefined) ||
    owner && ['plotArea', 'legend'].includes(owner.localName) && [x, y, width, height].some(value => value !== undefined) && [x, y, width, height].some(value => value === undefined)) return undefined;
  // MS-OI29500 21.2.2.232/235: invalid positions discard the entire manual layout.
  if ([x, y, width, height].some(value => value !== undefined && !Number.isFinite(value)) ||
    x !== undefined && (x < (xMode === 'edge' ? 0 : -1) || x > 1) ||
    y !== undefined && (y < (yMode === 'edge' ? 0 : -1) || y > 1) ||
    width !== undefined && (width < 0 || width > 1) || height !== undefined && (height < 0 || height > 1)) return undefined;
  return { target: value('layoutTarget') === 'inner' ? 'inner' : 'outer', xMode, yMode, widthMode: mode('wMode'), heightMode: mode('hMode'),
    ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }), ...(width === undefined || text ? {} : { width }), ...(height === undefined || text ? {} : { height }) };
}

/** Edge sizes name the far edge; factor sizes name the extent. Office keeps the box on the chart. */
export function chartManualRect(layout: ChartManualLayout | undefined, automatic: ChartRect, width: number, height: number): ChartRect {
  if (!layout || [layout.x, layout.y, layout.width, layout.height].every(value => value === undefined)) return automatic;
  const x = layout.x === undefined ? automatic.x : (layout.xMode === 'edge' ? 0 : automatic.x) + layout.x * width;
  const y = layout.y === undefined ? automatic.y : (layout.yMode === 'edge' ? 0 : automatic.y) + layout.y * height;
  const w = layout.width === undefined ? automatic.width : Math.min(width, Math.max(0, layout.width * width - (layout.widthMode === 'edge' ? x : 0)));
  const h = layout.height === undefined ? automatic.height : Math.min(height, Math.max(0, layout.height * height - (layout.heightMode === 'edge' ? y : 0)));
  return { x: layout.x === undefined && layout.width === undefined ? automatic.x : Math.max(0, Math.min(width - w, x)), y: layout.y === undefined && layout.height === undefined ? automatic.y : Math.max(0, Math.min(height - h, y)), width: w, height: h };
}

/** Outer plot layout includes axis labels; their automatic pixel insets remain outside the data box. */
export function chartManualPlot(layout: ChartManualLayout | undefined, inner: ChartRect, outer: ChartRect, width: number, height: number): ChartRect {
  if (!layout) return inner;
  if (layout.target === 'inner') return chartManualRect(layout, inner, width, height);
  const box = chartManualRect(layout, outer, width, height);
  return { x: box.x + inner.x - outer.x, y: box.y + inner.y - outer.y,
    width: Math.max(0, box.width - outer.width + inner.width), height: Math.max(0, box.height - outer.height + inner.height) };
}

/** Outer layout retains the measured labels and their spacing, rather than fixed automatic margins. */
export function chartOuterPlot(model: SupportedChartModel, layout: CartesianChartLayout, measure: (text: string, font: ChartFont) => number): ChartRect {
  const { plot, ticks, categoryRotation } = layout;
  const { horizontal, valueAxis: value, categoryAxis: category, numericLabelEdge, labelSide, categoryLabelEdge, categoryLabelDirection } = cartesianAxisPositions(model, layout);
  const numericFont = chartFont('tick', value?.textStyle, model), categoryFont = chartFont('category', category?.textStyle, model);
  const numericWidth = Math.max(0, ...ticks.map(tick => measure(chartTickLabel(tick / (value?.displayUnit ?? 1), chartAxisFormat(model, value), { dateSystem: model.dateSystem ?? '1900' }), numericFont)));
  const categoryWidth = Math.max(0, ...chartCategoryAxisLabels(model, layout).map(text => measure(text, categoryFont)));
  const angle = Math.abs(categoryRotation) * Math.PI / 180;
  let left = plot.x, top = plot.y, right = plot.x + plot.width, bottom = plot.y + plot.height;
  if (value && !value.deleted && value.tickLabelPosition !== 'none') {
    if (horizontal) {
      if (labelSide > 0) bottom = Math.max(bottom, numericLabelEdge + numericFont.size * 1.2 + 9);
      else top = Math.min(top, numericLabelEdge - numericFont.size - 9);
    } else if (labelSide > 0) right = Math.max(right, numericLabelEdge + numericWidth + 10);
    else left = Math.min(left, numericLabelEdge - numericWidth - 10);
  }
  if (category && !category.deleted && category.tickLabelPosition !== 'none') {
    if (horizontal) {
      if (categoryLabelDirection > 0) left = Math.min(left, categoryLabelEdge - categoryWidth - 11);
      else right = Math.max(right, categoryLabelEdge + categoryWidth + 11);
    } else {
      const distance = 9 + categoryFont.size * (category.labelOffset ?? 100) / 100 + Math.abs(Math.sin(angle)) * categoryWidth;
      if (categoryLabelDirection > 0) bottom = Math.max(bottom, categoryLabelEdge + distance + Math.abs(Math.cos(angle)) * categoryFont.size * .2);
      else top = Math.min(top, categoryLabelEdge - distance - Math.abs(Math.cos(angle)) * categoryFont.size);
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function chartOuterXYPlot(model: SupportedChartModel, layout: ScatterChartLayout, measure: (text: string, font: ChartFont) => number): ChartRect {
  const { plot } = layout;
  let left = plot.x, top = plot.y, right = plot.x + plot.width, bottom = plot.y + plot.height;
  for (const horizontal of [true, false]) {
    const { axis, side, edge } = xyAxisPosition(model, layout, horizontal);
    if (axis?.deleted || axis?.tickLabelPosition === 'none') continue;
    const font = chartFont('tick', axis?.textStyle, model);
    if (horizontal) {
      if (side > 0) bottom = Math.max(bottom, edge + font.size * 1.2 + 9);
      else top = Math.min(top, edge - font.size - 9);
    } else {
      const width = Math.max(0, ...layout.yTicks.map(tick => measure(chartTickLabel(tick / (axis?.displayUnit ?? 1), chartAxisFormat(model, axis), { dateSystem: model.dateSystem ?? '1900' }), font))) + 10;
      if (side > 0) right = Math.max(right, edge + width);
      else left = Math.min(left, edge - width);
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
