import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { WordTableCellMargins } from './document.ts';

export const WORD_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type WordBorderSide = typeof WORD_BORDER_SIDES[number];
export interface WordTableBorder {
  readonly style: 'none' | 'single' | 'double' | 'dotted' | 'dashed';
  readonly widthPoints: number;
  readonly color: string;
}
export type WordCellBorders = Partial<Record<WordBorderSide, WordTableBorder>>;
export type WordTableBorders = WordCellBorders & { insideH?: WordTableBorder; insideV?: WordTableBorder };
export interface WordCellFormat {
  readonly shading?: string;
  readonly borders?: WordCellBorders;
  readonly verticalAlignment?: 'top' | 'center' | 'bottom';
  readonly margins?: WordTableCellMargins;
}
export interface WordRowFormat {
  readonly heightTwips?: number;
  readonly heightRule?: 'auto' | 'atLeast' | 'exact';
}
const color = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function isWordCellFormat(value: unknown): value is WordCellFormat {
  if (!record(value) || Object.keys(value).some(key => !['shading', 'borders', 'verticalAlignment', 'margins'].includes(key))) return false;
  if (value.shading !== undefined && value.shading !== 'transparent' && !color(value.shading)) return false;
  if (value.verticalAlignment !== undefined && !['top', 'center', 'bottom'].includes(String(value.verticalAlignment))) return false;
  if (value.borders !== undefined && (!record(value.borders) || Object.entries(value.borders).some(([side, b]) =>
    !WORD_BORDER_SIDES.some(value => value === side) || !record(b) || Object.keys(b).some(k => !['style', 'widthPoints', 'color'].includes(k)) ||
    !['none', 'single', 'double', 'dotted', 'dashed'].includes(String(b.style)) || !color(b.color) ||
    typeof b.widthPoints !== 'number' || !Number.isFinite(b.widthPoints) || b.widthPoints < 0 || b.widthPoints > 12))) return false;
  const margins = value.margins;
  if (margins !== undefined && (!record(margins) || Object.keys(margins).length !== 4 ||
    !['topTwips', 'endTwips', 'bottomTwips', 'startTwips'].every(k => Number.isSafeInteger(margins[k]) && Number(margins[k]) >= 0))) return false;
  return true;
}
export function isWordRowFormat(value: unknown): value is WordRowFormat {
  return record(value) && Object.keys(value).every(k => ['heightTwips', 'heightRule'].includes(k)) &&
    (value.heightTwips === undefined || Number.isSafeInteger(value.heightTwips) && Number(value.heightTwips) >= 0 && Number(value.heightTwips) <= 31680) &&
    (value.heightRule === undefined || ['auto', 'atLeast', 'exact'].includes(String(value.heightRule)));
}
const attr = (e: LosslessXmlElement, ns: string, name: string) => e.attributes.find(a => a.namespaceUri === ns && a.localName === name)?.value;
export const tableChild = (e: LosslessXmlElement | undefined, ns: string, name: string) => e?.children.find((n): n is LosslessXmlElement => n.kind === 'element' && n.namespaceUri === ns && n.localName === name);
export function readTableBorders(e: LosslessXmlElement | undefined, ns: string): WordTableBorders {
  const result: WordTableBorders = {};
  for (const side of [...WORD_BORDER_SIDES, 'insideH', 'insideV'] as const) {
    const border = tableChild(e, ns, side) ?? (side === 'left' ? tableChild(e, ns, 'start') : side === 'right' ? tableChild(e, ns, 'end') : undefined);
    if (!border) continue;
    const raw = attr(border, ns, 'val');
    const style = raw === 'nil' || raw === 'none' ? 'none' : raw === 'double' || raw === 'dotted' || raw === 'dashed' ? raw : 'single';
    const size = Number(attr(border, ns, 'sz') ?? 4) / 8;
    const rawColor = attr(border, ns, 'color');
    result[side] = { style, widthPoints: Number.isFinite(size) ? Math.max(0, size) : 0.5, color: rawColor && /^[\da-f]{6}$/i.test(rawColor) ? `#${rawColor.toUpperCase()}` : '#000000' };
  }
  return result;
}
export function readTableShading(e: LosslessXmlElement | undefined, ns: string): string | undefined {
  if (!e) return undefined;
  const fill = attr(e, ns, 'fill');
  return fill && /^[\da-f]{6}$/i.test(fill) ? `#${fill.toUpperCase()}` : 'transparent';
}
export function cellFormatXml(format: WordCellFormat): Map<string, string> {
  if (!isWordCellFormat(format)) throw new TypeError('Invalid cell formatting.');
  const values = new Map<string, string>();
  if (format.shading !== undefined) values.set('shd', `<w:shd w:val="clear" w:fill="${format.shading === 'transparent' ? 'auto' : format.shading.slice(1)}"/>`);
  if (format.verticalAlignment) values.set('vAlign', `<w:vAlign w:val="${format.verticalAlignment}"/>`);
  if (format.margins) values.set('tcMar', `<w:tcMar>${[['top', format.margins.topTwips], ['left', format.margins.startTwips], ['bottom', format.margins.bottomTwips], ['right', format.margins.endTwips]].map(([k,v]) => `<w:${k} w:w="${v}" w:type="dxa"/>`).join('')}</w:tcMar>`);
  if (format.borders) values.set('tcBorders', `<w:tcBorders>${borderXml(format.borders)}</w:tcBorders>`);
  return values;
}
export function borderXml(borders: WordTableBorders): string {
  return Object.entries(borders).map(([side,b]) => `<w:${side} w:val="${b.style}" w:sz="${Math.round(b.widthPoints * 8)}" w:color="${b.color.slice(1)}"/>`).join('');
}
export function rowFormatXml(format: WordRowFormat): string {
  if (!isWordRowFormat(format)) throw new TypeError('Invalid row formatting.');
  return `<w:trHeight w:val="${format.heightTwips ?? 0}" w:hRule="${format.heightRule ?? 'atLeast'}"/>`;
}
