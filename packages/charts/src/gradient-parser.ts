import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { parseChartColorContainer } from './formatting-parser.ts';
import type { ChartGradient } from './model.ts';

const child = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name)?.value;
const percentage = (value: string | undefined) => value?.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value ?? 0) / 100000;

/** Keep theme references and ordered colour transforms until the host binds its theme. */
export function parseChartGradient(parent: LosslessXmlElement | undefined, ns: string): ChartGradient | undefined {
  const gradient = child(parent, ns, 'gradFill');
  if (!gradient) return undefined;
  const list = child(gradient, ns, 'gsLst');
  const stops = list?.children.flatMap(node => {
    if (node.kind !== 'element' || node.namespaceUri !== ns || node.localName !== 'gs') return [];
    const color = parseChartColorContainer(node, ns);
    const offset = percentage(attr(node, 'pos'));
    return color && Number.isFinite(offset) ? [{ offset: Math.min(1, Math.max(0, offset)), color }] : [];
  }).sort((a, b) => a.offset - b.offset) ?? [{ offset: 0, color: { kind: 'rgb' as const, value: '#000000' } }, { offset: 1, color: { kind: 'rgb' as const, value: '#FFFFFF' } }];
  if (!stops.length) return undefined;
  const linear = child(gradient, ns, 'lin'), path = child(gradient, ns, 'path'), rect = child(path, ns, 'fillToRect'), tile = child(gradient, ns, 'tileRect');
  const center = [(percentage(attr(rect, 'l')) + 1 - percentage(attr(rect, 'r'))) / 2, (percentage(attr(rect, 't')) + 1 - percentage(attr(rect, 'b'))) / 2] as const;
  return { kind: !path ? 'linear' : attr(path, 'path') === 'circle' ? 'radial' : 'rectangular',
    angle: Number(attr(linear, 'ang') ?? 0) / 60000, scaled: ['1', 'true'].includes(attr(linear, 'scaled') ?? '0'), center, ...(path ? { path: attr(path, 'path') === 'circle' ? 'circle' as const : attr(path, 'path') === 'rect' ? 'rect' as const : 'shape' as const } : {}), ...(tile ? { tileRect: [percentage(attr(tile, 'l')), percentage(attr(tile, 't')), 1 - percentage(attr(tile, 'r')), 1 - percentage(attr(tile, 'b'))] as const } : {}), ...(rect ? { focusRect: [percentage(attr(rect, 'l')), percentage(attr(rect, 't')), 1 - percentage(attr(rect, 'r')), 1 - percentage(attr(rect, 'b'))] as const } : {}), stops };
}
