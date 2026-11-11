import { ChartParseError, ChartPreviewLimitError } from './parser-errors.ts';
import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { parseChartShapeStyle, parseChartTextStyle } from './formatting-parser.ts';
import { readChartTitleText } from './rich-text.ts';
import type { ChartShapeStyle, ChartTextStyle, ChartTextParagraph } from './model.ts';
import { parseChartManualLayout, type ChartManualLayout } from './manual-layout.ts';

export interface ChartDataLabelOptions extends ChartShapeStyle {
  readonly layout?: ChartManualLayout;
  readonly deleted?: boolean;
  readonly showValue?: boolean;
  readonly showCategory?: boolean;
  readonly showSeries?: boolean;
  readonly showPercent?: boolean;
  readonly showBubbleSize?: boolean;
  readonly showLegendKey?: boolean;
  readonly position?: string;
  readonly separator?: string;
  readonly formatCode?: string;
  readonly text?: string;
  readonly richText?: readonly ChartTextParagraph[];
  readonly textStyle?: ChartTextStyle;
}
export interface ChartDataLabels extends ChartDataLabelOptions {
  readonly points?: Readonly<Record<number, ChartDataLabelOptions>>;
}
const children = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name) ?? [];
const attribute = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(attribute => attribute.localName === name && !attribute.namespaceUri)?.value;
const text = (node: LosslessXmlElement): string => node.children.map(child => child.kind === 'element' ? text(child) : child.kind === 'text' || child.kind === 'cdata' ? child.value : '').join('');

/** Keep explicit label properties separate so point, series and plot defaults can cascade. */
export function parseChartDataLabels(element: LosslessXmlElement | undefined, c: string, a: string): ChartDataLabels | undefined {
  if (!element) return undefined;
  function options(element: LosslessXmlElement): ChartDataLabelOptions {
    const flags = Object.fromEntries([
      ['deleted', 'delete'], ['showValue', 'showVal'], ['showCategory', 'showCatName'], ['showSeries', 'showSerName'],
      ['showPercent', 'showPercent'], ['showBubbleSize', 'showBubbleSize'], ['showLegendKey', 'showLegendKey'],
    ].flatMap(([key, name]) => {
      const node = children(element, c, name!)[0];
      const value = attribute(node, 'val') ?? '1';
      if (node && !['0', '1', 'true', 'false'].includes(value)) throw new ChartParseError('Invalid data label boolean.');
      return node ? [[key!, value === '1' || value === 'true']] : [];
    }));
    const position = attribute(children(element, c, 'dLblPos')[0], 'val');
    const separator = children(element, c, 'separator')[0];
    const formatCode = attribute(children(element, c, 'numFmt')[0], 'formatCode');
    const richText = readChartTitleText(element, c, a);
    const reference = children(children(element, c, 'tx')[0], c, 'strRef')[0];
    const cache = children(reference, c, 'strCache')[0];
    const value = children(children(cache, c, 'pt')[0], c, 'v')[0];
    const textStyle = parseChartTextStyle(element, c, a), shape = children(element, c, 'spPr')[0];
    const shapeStyle = parseChartShapeStyle(shape, a);
    const layout = parseChartManualLayout(element, c);
    return { ...flags, ...(position ? { position } : {}), ...(separator ? { separator: text(separator) } : {}),
      ...(formatCode ? { formatCode } : {}), ...(richText ? { richText, text: richText.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n') } : value ? { text: text(value) } : {}),
      ...(textStyle ? { textStyle } : {}), ...(layout ? { layout } : {}), ...shapeStyle };
  }
  const points = children(element, c, 'dLbl');
  if (points.length > 100_000) throw new ChartPreviewLimitError('Data labels exceed preview limits.');
  return { ...options(element), ...(points.length ? { points: Object.fromEntries(points.map(point => {
    const index = Number(attribute(children(point, c, 'idx')[0], 'val'));
    if (!Number.isSafeInteger(index) || index < 0) throw new ChartParseError('Invalid data label index.');
    return [index, options(point)];
  })) } : {}) };
}
