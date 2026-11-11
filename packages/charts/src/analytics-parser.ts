import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartDataSequence, ChartLineStyle, ChartTextStyle, ChartTextParagraph, ChartShapeStyle } from './model.ts';
import { parseChartLine, parseChartTextStyle, parseChartShapeStyle } from './formatting-parser.ts';
import { ChartParseError } from './parser-errors.ts';
import { parseChartManualLayout, type ChartManualLayout } from './manual-layout.ts';
import { readChartLabelText } from './rich-text.ts';

export interface ChartTrendline {
  readonly type: 'linear' | 'exp' | 'log' | 'poly' | 'power' | 'movingAvg';
  readonly name?: string;
  readonly order: number;
  readonly period: number;
  readonly forward: number;
  readonly backward: number;
  readonly intercept?: number;
  readonly displayEquation: boolean;
  readonly displayRSquared: boolean;
  readonly lineStyle?: ChartLineStyle;
  readonly labelStyle?: ChartTextStyle;
  readonly labelLayout?: ChartManualLayout;
  readonly labelText?: readonly ChartTextParagraph[];
  readonly labelShape?: ChartShapeStyle;
}
export interface ChartErrorBars {
  readonly direction: 'x' | 'y';
  readonly type: 'both' | 'plus' | 'minus';
  readonly valueType: 'cust' | 'fixedVal' | 'percentage' | 'stdDev' | 'stdErr';
  readonly value: number;
  readonly noEndCap: boolean;
  readonly plus?: ChartDataSequence;
  readonly minus?: ChartDataSequence;
  readonly lineStyle?: ChartLineStyle;
}

/** Analytical overlays retain independent shape properties and sparse custom error caches. */
export function parseChartAnalytics(series: LosslessXmlElement, ns: string, drawing: string, sequence: (node: LosslessXmlElement | undefined) => ChartDataSequence | undefined) {
  const children = (node: LosslessXmlElement, name: string) => node.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name);
  const child = (node: LosslessXmlElement, name: string) => children(node, name)[0];
  const val = (node: LosslessXmlElement, name: string) => child(node, name)?.attributes.find(attr => !attr.namespaceUri && attr.localName === 'val')?.value;
  function choice<const T extends string>(raw: string | undefined, choices: readonly T[], fallback: T): T {
    if (raw === undefined) return fallback;
    const value = choices.find(value => value === raw);
    if (value === undefined) throw new ChartParseError(`Invalid chart analytical property ${raw}.`);
    return value;
  }
  const number = (node: LosslessXmlElement, name: string, fallback?: number) => {
    const raw = val(node, name);
    const value = raw === undefined ? fallback : Number(raw);
    if (value !== undefined && !Number.isFinite(value)) throw new ChartParseError(`Invalid chart ${name}.`);
    return value;
  };
  const boolean = (node: LosslessXmlElement, name: string) => !!child(node, name) && choice(val(node, name), ['true', '1', 'false', '0'], 'true') !== 'false' && val(node, name) !== '0';
  const trendlines = children(series, 'trendline').map((node): ChartTrendline => {
    const order = number(node, 'order', 2)!, period = number(node, 'period', 2)!;
    if (!Number.isInteger(order) || order < 2 || order > 6 || !Number.isInteger(period) || period < 2 || period > 255) throw new ChartParseError('Invalid trendline order or period.');
    const forward = number(node, 'forward', 0)!, backward = number(node, 'backward', 0)!;
    if (forward < 0 || backward < 0) throw new ChartParseError('Trendline forecasts cannot be negative.');
    const text = child(node, 'name')?.children.flatMap(child => child.kind === 'text' || child.kind === 'cdata' ? [child.value] : []).join('');
    const label = child(node, 'trendlineLbl'), labelLayout = parseChartManualLayout(label, ns), labelText = readChartLabelText(label, ns, drawing), labelShape = label && parseChartShapeStyle(child(label, 'spPr'), drawing);
    return { type: choice(val(node, 'trendlineType'), ['linear', 'exp', 'log', 'poly', 'power', 'movingAvg'], 'linear'),
      ...(text === undefined ? {} : { name: text }), order, period, forward, backward,
      ...(number(node, 'intercept') === undefined ? {} : { intercept: number(node, 'intercept')! }),
      displayEquation: boolean(node, 'dispEq'), displayRSquared: boolean(node, 'dispRSqr'),
      ...(parseChartLine(child(node, 'spPr'), drawing) ? { lineStyle: parseChartLine(child(node, 'spPr'), drawing)! } : {}),
      ...(labelLayout ? { labelLayout } : {}), ...(labelText ? { labelText } : {}), ...(labelShape ? { labelShape } : {}),
      ...(parseChartTextStyle(child(node, 'trendlineLbl'), ns, drawing) ? { labelStyle: parseChartTextStyle(child(node, 'trendlineLbl'), ns, drawing)! } : {}) };
  });
  const errorBars = children(series, 'errBars').map((node): ChartErrorBars => {
    const value = number(node, 'val', 1)!;
    if (value < 0) throw new ChartParseError('Error bar magnitude cannot be negative.');
    const plus = sequence(child(node, 'plus')), minus = sequence(child(node, 'minus'));
    return { direction: choice(val(node, 'errDir'), ['x', 'y'], 'y'), type: choice(val(node, 'errBarType'), ['both', 'plus', 'minus'], 'both'),
      valueType: choice(val(node, 'errValType'), ['cust', 'fixedVal', 'percentage', 'stdDev', 'stdErr'], 'fixedVal'), value, noEndCap: boolean(node, 'noEndCap'),
      ...(plus ? { plus } : {}), ...(minus ? { minus } : {}),
      ...(parseChartLine(child(node, 'spPr'), drawing) ? { lineStyle: parseChartLine(child(node, 'spPr'), drawing)! } : {}) };
  });
  return { ...(trendlines.length ? { trendlines } : {}), ...(errorBars.length ? { errorBars } : {}) };
}
