import { createWordArtifact } from './create.ts';
import { imagePlacement, type WordImagePosition } from './image-placement.ts';
import type { WordImageDrawing } from './drawings.ts';

/** Samples are local point coordinates with normalized pressure. One object is one stroke. */
export interface WordAuthoredInk extends WordImagePosition {
  readonly points: readonly (readonly [number, number, number])[];
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly size: number;
  readonly highlighter?: boolean;
}
export function isWordAuthoredInk(value: unknown): value is WordAuthoredInk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ink = value as Record<string, unknown>;
  if (!['width', 'height', 'size'].every(key => typeof ink[key] === 'number' && Number.isFinite(ink[key]) && Number(ink[key]) > 0 && Number.isSafeInteger(Math.round(Number(ink[key]) * 12700)))) return false;
  if (typeof ink.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(ink.color)) return false;
  if (ink.highlighter !== undefined && typeof ink.highlighter !== 'boolean') return false;
  if (!Array.isArray(ink.points) || !ink.points.length || !ink.points.every(p => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n)) && p[2] >= 0 && p[2] <= 1)) return false;
  try { imagePlacement(ink as WordImagePosition, Number(ink.width), Number(ink.width)); } catch { return false; }
  return Object.keys(ink).every(key => ['points','width','height','color','size','highlighter','layout','alignment','moveWithText','wrap','horizontalRelativeTo','verticalRelativeTo','x','y'].includes(key));
}

/** Write the Office profile with explicit calibration, so no host device defaults are needed. */
export function authoredInkXml(ink: WordAuthoredInk): string {
  if (!isWordAuthoredInk(ink)) throw new TypeError('Invalid authored ink.');
  return `<ink xmlns="http://www.w3.org/2003/InkML"><definitions><context xml:id="context"><inkSource xml:id="device"><traceFormat><channel name="X" type="integer" units="cm"/><channel name="Y" type="integer" units="cm"/><channel name="F" type="integer" units="dev" min="0" max="1023"/></traceFormat><channelProperties><channelProperty channel="X" name="resolution" value="1000" units="1/cm"/><channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/></channelProperties></inkSource></context><brush xml:id="pen"><brushProperty name="width" value="${ink.size}" units="pt"/><brushProperty name="height" value="${ink.size}" units="pt"/><brushProperty name="color" value="${ink.color}"/><brushProperty name="tip" value="${ink.highlighter ? 'rectangle' : 'ellipse'}"/><brushProperty name="transparency" value="${ink.highlighter ? 128 : 0}"/><brushProperty name="ignorePressure" value="${ink.highlighter ? 'true' : 'false'}"/><brushProperty name="fitToCurve" value="false"/></brush></definitions><trace xml:id="stroke" contextRef="#context" brushRef="#pen">${ink.points.map(p => [Math.round(p[0] * 2540 / 72), Math.round(p[1] * 2540 / 72), Math.round(p[2] * 1023)].join(' ')).join(', ')}</trace></ink>`;
}

export function authoredInkMarkup(ink: WordAuthoredInk, id: number, availableWidth: number) {
  const payload = authoredInkXml(ink);
  const placement = imagePlacement(ink, ink.width, availableWidth);
  const cx = Math.round(ink.width * 12700), cy = Math.round(ink.height * 12700);
  return {
    payload,
    markup: `<w:r><w:drawing>${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Ink ${id}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"><w14:contentPart xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" r:id="ink${id}"/></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`,
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
