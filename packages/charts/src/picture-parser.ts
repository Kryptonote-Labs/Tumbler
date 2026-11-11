import type { DrawingPictureFill, LosslessXmlElement } from '@tumblerjs/ooxml';

export interface ChartPictureFill extends Omit<DrawingPictureFill, 'bytes' | 'contentType'> {
  readonly relationshipId: string;
}
export type ChartImage = Pick<DrawingPictureFill, 'bytes' | 'contentType'>;
const child = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name)?.value;
const percent = (value: string | undefined, fallback = 0) => value === undefined ? fallback : value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value) / 100000;
const rect = (node: LosslessXmlElement | undefined) => [percent(attr(node, 'l')), percent(attr(node, 't')), percent(attr(node, 'r')), percent(attr(node, 'b'))] as const;

/** Retain the relationship and native picture geometry; the owning package resolves its bytes. */
export function parseChartPicture(parent: LosslessXmlElement | undefined, namespace: string): ChartPictureFill | undefined {
  const fill = child(parent, namespace, 'blipFill'), blip = child(fill, namespace, 'blip');
  const relationshipId = blip?.attributes.find(attribute => attribute.namespaceUri.endsWith('/relationships') && attribute.localName === 'embed')?.value;
  if (!fill || !relationshipId) return undefined;
  const tile = child(fill, namespace, 'tile'), stretch = child(fill, namespace, 'stretch'), fillRect = child(stretch, namespace, 'fillRect');
  const dpi = Number(attr(fill, 'dpi') ?? 0);
  return { relationshipId, crop: rect(child(fill, namespace, 'srcRect')), opacity: percent(attr(child(blip, namespace, 'alphaModFix'), 'amt'), 1),
    ...(dpi > 0 && Number.isFinite(dpi) ? { dpi } : {}), ...(fillRect ? { stretch: rect(fillRect) } : {}),
    ...(tile || !stretch ? { tile: { x: Number(attr(tile, 'tx') ?? 0) / 9525, y: Number(attr(tile, 'ty') ?? 0) / 9525,
      scaleX: percent(attr(tile, 'sx'), 1), scaleY: percent(attr(tile, 'sy'), 1), align: attr(tile, 'algn') ?? 'tl', flip: attr(tile, 'flip') ?? 'none' } } : {}) };
}
