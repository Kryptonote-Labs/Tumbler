import type { LosslessXmlElement } from './xml/source-document.ts';

const DASHES: Readonly<Record<string, readonly number[]>> = {
  solid: [], dot: [1, 3], sysDot: [1, 1], dash: [4, 3], sysDash: [3, 1], lgDash: [8, 3],
  dashDot: [4, 3, 1, 3], sysDashDot: [3, 1, 1, 1], lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDotDot: [3, 1, 1, 1, 1, 1],
};
export interface DrawingStrokeProperties {
  /** Dash lengths in multiples of the stroke width. */
  readonly dash?: readonly number[];
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'round' | 'bevel' | 'miter';
  readonly miterLimit?: number;
}

/** Shared DrawingML dash, cap and join semantics, including Strict percentage lexical forms. */
export function readDrawingStrokeProperties(line: LosslessXmlElement): DrawingStrokeProperties {
  const children = line.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === line.namespaceUri);
  const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name)?.value;
  const ratio = (value: string | undefined) => value?.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value) / 100000;
  const custom = children.find(child => child.localName === 'custDash');
  const preset = children.find(child => child.localName === 'prstDash');
  const raw = custom?.children.flatMap(child => child.kind === 'element' && child.namespaceUri === line.namespaceUri && child.localName === 'ds' ? [ratio(attr(child, 'd')), ratio(attr(child, 'sp'))] : []);
  const dash = raw && raw.every(value => Number.isFinite(value) && value >= 0) ? raw : preset ? DASHES[attr(preset, 'val') ?? 'solid'] : undefined;
  const cap = attr(line, 'cap');
  const join = children.find(child => ['round', 'bevel', 'miter'].includes(child.localName));
  const limit = join?.localName === 'miter' ? ratio(attr(join, 'lim') ?? '800000') : undefined;
  return {
    ...(dash ? { dash } : {}),
    ...(cap === 'flat' ? { cap: 'butt' as const } : cap === 'rnd' ? { cap: 'round' as const } : cap === 'sq' ? { cap: 'square' as const } : {}),
    ...(join ? { join: join.localName === 'round' ? 'round' as const : join.localName === 'bevel' ? 'bevel' as const : 'miter' as const } : {}),
    ...(limit !== undefined && Number.isFinite(limit) && limit > 0 ? { miterLimit: limit } : {}),
  };
}
