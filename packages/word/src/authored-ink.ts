import { authoredOfficeInkXml } from '@tumblerjs/ink';
import { createWordArtifact } from './create.ts';
import { imagePlacement, type WordImagePosition } from './image-placement.ts';
import type { WordImageDrawing } from './drawings.ts';

/** A stroke uses point coordinates within its drawing, with pressure from zero to one. */
export interface WordInkStroke {
  readonly points: readonly (readonly [number, number, number])[];
  readonly color: string;
  readonly size: number;
  readonly highlighter?: boolean;
}
interface InkFrame extends WordImagePosition {
  readonly width: number;
  readonly height: number;
}
/** Multi-stroke drawings preserve one shared coordinate space. Legacy strokes fit their frame. */
export type WordAuthoredInk = InkFrame & (
  | (WordInkStroke & { readonly strokes?: never })
  | { readonly strokes: readonly WordInkStroke[] }
);
function isStroke(value: unknown): value is WordInkStroke {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stroke = value as Record<string, unknown>;
  return typeof stroke.color === 'string' && /^#[0-9a-f]{6}$/i.test(stroke.color)
    && typeof stroke.size === 'number' && Number.isFinite(stroke.size) && stroke.size > 0
    && Number.isSafeInteger(Math.round(stroke.size * 12700))
    && (stroke.highlighter === undefined || typeof stroke.highlighter === 'boolean')
    && Array.isArray(stroke.points) && stroke.points.length > 0
    && stroke.points.every(p => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n)) && p[2] >= 0 && p[2] <= 1);
}
export function isWordAuthoredInk(value: unknown): value is WordAuthoredInk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ink = value as Record<string, unknown>;
  if (!['width', 'height'].every(key => typeof ink[key] === 'number' && Number.isFinite(ink[key]) && Number(ink[key]) > 0 && Number.isSafeInteger(Math.round(Number(ink[key]) * 12700)))) return false;
  const strokeKeys = ['points', 'color', 'size', 'highlighter'];
  if (ink.strokes !== undefined) {
    if (!Array.isArray(ink.strokes) || !ink.strokes.length || !ink.strokes.every(s => isStroke(s) && Object.keys(s).every(key => strokeKeys.includes(key)))) return false;
    if (strokeKeys.some(key => key in ink)) return false;
  } else if (!isStroke(ink)) return false;
  try { imagePlacement(ink as WordImagePosition, Number(ink.width), Number(ink.width)); } catch { return false; }
  return Object.keys(ink).every(key => [...strokeKeys,'strokes','width','height','layout','alignment','moveWithText','wrap','horizontalRelativeTo','verticalRelativeTo','x','y'].includes(key));
}

/** Write the Office profile with explicit calibration, so no host device defaults are needed. */
export function authoredInkXml(ink: WordAuthoredInk): string {
  if (!isWordAuthoredInk(ink)) throw new TypeError('Invalid authored ink.');
  const strokes = ink.strokes ?? [ink];
  return authoredOfficeInkXml(strokes);
}

export function authoredInkMarkup(ink: WordAuthoredInk, id: number, availableWidth: number) {
  const payload = authoredInkXml(ink);
  const placement = imagePlacement(ink, ink.width, availableWidth);
  const cx = Math.round(ink.width * 12700), cy = Math.round(ink.height * 12700);
  // Explicit native transform preserves the shared frame instead of fitting trace bounds to it.
  let transform = '';
  if (ink.strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const stroke of ink.strokes) for (const [x, y] of stroke.points) {
      const px = Math.round(x * 2540 / 72), py = Math.round(y * 2540 / 72);
      minX = Math.min(minX, px); minY = Math.min(minY, py);
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    }
    transform = `<w14:xfrm><a:off x="${minX * 360}" y="${minY * 360}"/><a:ext cx="${(maxX - minX || 1) * 360}" cy="${(maxY - minY || 1) * 360}"/></w14:xfrm>`;
  }
  return {
    payload,
    markup: `<w:r><w:drawing>${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Ink ${id}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"><w14:contentPart xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" r:id="ink${id}">${transform}</w14:contentPart></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`,
  };
}

const previews = new WeakMap<WordAuthoredInk, WordImageDrawing>();
/** Use the package reader for preview and export, keeping one native ink interpretation. */
export function nativeAuthoredInk(id: number, ink: WordAuthoredInk): WordImageDrawing {
  let drawing = previews.get(ink);
  if (!drawing) {
    const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', ink }] }] });
    const first = [...artifact.document.drawings.values()][0];
    if (first?.kind !== 'image' || !first.ink) throw new Error('Authored ink could not be read.');
    drawing = first;
    previews.set(ink, drawing);
  }
  return { ...drawing, elementId: id };
}
