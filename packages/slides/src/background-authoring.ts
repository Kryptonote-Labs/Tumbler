import { z } from 'zod';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { openPresentationArtifact, type PresentationArtifact } from './artifact.ts';
import { children, editable, slideById } from './authoring-slides.ts';
import { partXml, A, R } from './authoring-xml.ts';

/** Common presets currently read and displayed by the SVG renderer. */
export const backgroundPatterns = [
  'pct5',
  'pct10',
  'pct20',
  'pct25',
  'pct30',
  'pct40',
  'pct50',
  'pct60',
  'pct70',
  'pct75',
  'pct80',
  'pct90',
  'horz',
  'vert',
  'cross',
  'diagCross',
  'ltDnDiag',
  'dkDnDiag',
  'wdDnDiag',
  'ltUpDiag',
  'dkUpDiag',
  'wdUpDiag',
  'ltHorz',
  'narHorz',
  'dkHorz',
  'ltVert',
  'narVert',
  'dkVert',
  'smCheck',
  'lgCheck',
  'dotGrid',
] as const;
const color = z.string().regex(/^#[a-f\d]{6}$/i);
const ratio = z.number().finite().min(0).max(1);
const rect = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(([l, t, r, b]) => l + r < 1 && t + b < 1, 'The crop must leave a visible image.');
export const backgroundFill = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit') }).strict(),
  z.object({ kind: z.literal('solid'), color, opacity: ratio.optional() }).strict(),
  z
    .object({
      kind: z.literal('gradient'),
      type: z.enum(['linear', 'radial']),
      angle: z.number().finite().optional(),
      scaled: z.boolean().optional(),
      center: z.tuple([ratio, ratio]).optional(),
      stops: z.array(z.object({ offset: ratio, color, opacity: ratio.optional() }).strict()).min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal('pattern'),
      preset: z.enum(backgroundPatterns),
      foreground: color,
      background: color,
    })
    .strict(),
  z
    .object({
      kind: z.literal('picture'),
      data: z.string(),
      contentType: z.enum(['image/png', 'image/jpeg']),
      opacity: ratio.optional(),
      crop: rect.optional(),
      tile: z
        .object({
          scaleX: z.number().finite().positive(),
          scaleY: z.number().finite().positive(),
          x: z.number().finite().optional(),
          y: z.number().finite().optional(),
          align: z.enum(['tl', 't', 'tr', 'l', 'ctr', 'r', 'bl', 'b', 'br']).optional(),
          flip: z.enum(['none', 'x', 'y', 'xy']).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type BackgroundFill = z.infer<typeof backgroundFill>;
const percent = (n: number) => Math.round(n * 100000);
const colour = (value: string, opacity = 1) =>
  `<a:srgbClr val="${value.slice(1)}"><a:alpha val="${percent(opacity)}"/></a:srgbClr>`;

/** Writes native p:bgPr fills (ECMA-376-1 §19.3.1.2); inherit removes only the slide override. */
export function setSlideBackground(
  artifact: PresentationArtifact,
  id: string,
  input: BackgroundFill,
) {
  editable(artifact);
  const fill = backgroundFill.parse(input);
  const slide = slideById(artifact, id),
    source = partXml(artifact, slide.part);
  const common = children(source.root).find((e) => e.localName === 'cSld')!;
  const bg = children(common).find((e) => e.localName === 'bg');
  const tree = children(common).find((e) => e.localName === 'spTree')!;
  if (fill.kind === 'inherit' && !bg) return artifact;
  const tx = beginPackageTransaction(artifact.document.package);
  const strict = artifact.document.conformance === 'strict';
  let markup = '';
  if (fill.kind === 'solid')
    markup = `<a:solidFill>${colour(fill.color, fill.opacity)}</a:solidFill>`;
  if (fill.kind === 'gradient') {
    const stops = [...fill.stops]
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `<a:gs pos="${percent(s.offset)}">${colour(s.color, s.opacity)}</a:gs>`)
      .join('');
    const [x, y] = fill.center ?? [0.5, 0.5];
    const shade =
      fill.type === 'linear'
        ? `<a:lin ang="${Math.round(((((fill.angle ?? 0) % 360) + 360) % 360) * 60000) % 21600000}" scaled="${fill.scaled === false ? 0 : 1}"/>`
        : `<a:path path="circle"><a:fillToRect l="${percent(x)}" t="${percent(y)}" r="${percent(1 - x)}" b="${percent(1 - y)}"/></a:path>`;
    markup = `<a:gradFill><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`;
  }
  if (fill.kind === 'pattern')
    markup = `<a:pattFill prst="${fill.preset}"><a:fgClr>${colour(fill.foreground)}</a:fgClr><a:bgClr>${colour(fill.background)}</a:bgClr></a:pattFill>`;
  if (fill.kind === 'picture') {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fill.data) || fill.data.length % 4)
      throw new TypeError('Image data must be base64.');
    const bytes = Uint8Array.from(atob(fill.data), (c) => c.charCodeAt(0));
    if (
      fill.contentType === 'image/png'
        ? ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    )
      throw new TypeError('Image bytes do not match the content type.');
    const pkg = artifact.document.package;
    const ext = fill.contentType === 'image/png' ? 'png' : 'jpg';
    let n = 1;
    while (pkg.getPart(`/ppt/media/background${n}.${ext}`)) n++;
    const existing = pkg.parts.find((part) => {
      if (part.contentType !== fill.contentType) return false;
      const saved = pkg.readPart(part);
      return saved.length === bytes.length && saved.every((v, i) => v === bytes[i]);
    });
    const part = existing?.name.value ?? `/ppt/media/background${n}.${ext}`;
    if (!existing) tx.addPart(part, fill.contentType, bytes);
    const relationships = pkg.relationships(pkg.getPart(slide.part)!.name).items;
    const related = relationships.find(
      (r) =>
        r.type.endsWith('/image') && r.targetMode !== 'External' && r.targetPartName.value === part,
    );
    const used = new Set(relationships.map((r) => r.id));
    let rid = related?.id ?? `rIdBackground${n}`;
    if (!related) {
      while (used.has(rid)) rid += '_';
      tx.addRelationship(slide.part, {
        id: rid,
        type: `${strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R}/image`,
        target: part,
      });
    }
    const crop = fill.crop ?? [0, 0, 0, 0];
    const tile = fill.tile;
    const mode = tile
      ? `<a:tile tx="${Math.round((tile.x ?? 0) * 9525)}" ty="${Math.round((tile.y ?? 0) * 9525)}" sx="${percent(tile.scaleX)}" sy="${percent(tile.scaleY)}" algn="${tile.align ?? 'tl'}" flip="${tile.flip ?? 'none'}"/>`
      : '<a:stretch><a:fillRect/></a:stretch>';
    markup = `<a:blipFill><a:blip r:embed="${rid}"><a:alphaModFix amt="${percent(fill.opacity ?? 1)}"/></a:blip><a:srcRect l="${percent(crop[0])}" t="${percent(crop[1])}" r="${percent(crop[2])}" b="${percent(crop[3])}"/>${mode}</a:blipFill>`;
  }
  if (fill.kind !== 'inherit')
    markup = `<p:bg xmlns:p="${source.root.namespaceUri}" xmlns:a="${strict ? 'http://purl.oclc.org/ooxml/drawingml/main' : A}" xmlns:r="${strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R}"><p:bgPr>${markup}<a:effectLst/></p:bgPr></p:bg>`;
  const edit = beginLosslessXmlEdit(source);
  if (bg) edit.replaceElementMarkup(bg, markup);
  else edit.insertMarkupBefore(tree, markup);
  tx.replacePart(slide.part, edit.commit().bytes);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
