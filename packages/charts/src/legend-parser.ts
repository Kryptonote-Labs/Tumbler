import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { parseChartShapeStyle, parseChartTextStyle } from './formatting-parser.ts';
import type { ChartLegend, ChartLegendEntry, ChartLegendPosition } from './model.ts';
import { ChartParseError } from './parser-errors.ts';

export function parseChartLegend(element: LosslessXmlElement | undefined, c: string, a: string): ChartLegend | undefined {
  if (!element) return undefined;
  const children = (node: LosslessXmlElement, name: string) => node.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === c && child.localName === name);
  const value = (node: LosslessXmlElement | undefined) => node?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
  const boolean = (node: LosslessXmlElement | undefined, fallback: boolean) => {
    if (!node) return fallback;
    const raw = value(node) ?? '1';
    if (!['0', '1', 'false', 'true'].includes(raw)) throw new ChartParseError('Invalid legend boolean.');
    return raw === '1' || raw === 'true';
  };
  const positions: Readonly<Record<string, ChartLegendPosition>> = { b: 'bottom', l: 'left', r: 'right', t: 'top', tr: 'top-right' };
  const entries: Record<number, ChartLegendEntry> = {};
  for (const node of children(element, 'legendEntry')) {
    const raw = value(children(node, 'idx')[0]), index = Number(raw);
    if (raw === undefined || !/^\d+$/.test(raw.trim()) || !Number.isInteger(index) || index < 0 || index > 0xFFFFFFFF) throw new ChartParseError('Invalid legend entry index.');
    const deleted = children(node, 'delete')[0], textStyle = parseChartTextStyle(node, c, a);
    entries[index] = { ...(deleted ? { deleted: boolean(deleted, false) } : {}), ...(textStyle ? { textStyle } : {}) };
  }
  const shapeStyle = parseChartShapeStyle(children(element, 'spPr')[0], a), textStyle = parseChartTextStyle(element, c, a);
  return Object.freeze({ position: positions[value(children(element, 'legendPos')[0]) ?? 'r'] ?? 'right', overlay: boolean(children(element, 'overlay')[0], false),
    ...(shapeStyle ? { shapeStyle } : {}), ...(textStyle ? { textStyle } : {}), ...(Object.keys(entries).length ? { entries: Object.freeze(entries) } : {}) });
}
