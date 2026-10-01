import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { normalizeWordBorders, type WordTableBorders, type WordBorder } from './table-borders.ts';

export function readWordBorders(properties: LosslessXmlElement | undefined, name: string, namespace: string): WordTableBorders {
  const container = properties?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === namespace && child.localName === name);
  const result: WordTableBorders = {};
  for (const child of container?.children ?? []) {
    if (child.kind !== 'element' || child.namespaceUri !== namespace) continue;
    const side = child.localName === 'start' ? 'left' : child.localName === 'end' ? 'right' : child.localName;
    if (!['top', 'right', 'bottom', 'left', 'insideH', 'insideV'].includes(side)) continue;
    const attr = (name: string) => child.attributes.find(attribute => attribute.namespaceUri === namespace && attribute.localName === name)?.value;
    const raw = attr('val');
    const style: WordBorder['style'] = raw === 'nil' || raw === 'none' ? 'none' : raw === 'double' || raw === 'dotted' || raw === 'dashed' ? raw : 'single';
    const color = attr('color');
    const size = Number(attr('sz') ?? 6) / 8;
    Object.assign(result, { [side]: { color: color && /^[\da-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : '#000000', width: style === 'none' ? 0 : Number.isFinite(size) && size > 0 ? size : 0.75, style } });
  }
  return Object.freeze(result);
}

export function wordBorderMarkup(side: string, border: WordBorder, prefix = 'w', namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'): string {
  const tag = (name: string) => `${prefix || 'w'}:${name}`;
  const declaration = prefix ? '' : ` xmlns:w="${namespace}"`;
  return `<${tag(side)}${declaration} ${tag('val')}="${border.style}" ${tag('sz')}="${Math.round(border.width * 8)}" ${tag('color')}="${border.color.slice(1)}"/>`;
}

export function wordBordersMarkup(borders: WordTableBorders, name: string, prefix = 'w', namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'): string {
  const normalized = normalizeWordBorders(borders);
  const tag = prefix ? `${prefix}:${name}` : name;
  return `<${tag}>${Object.entries(normalized).map(([side, border]) => wordBorderMarkup(side, border, prefix, namespace)).join('')}</${tag}>`;
}
