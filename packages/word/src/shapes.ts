import type { WordTextRun } from './create.ts';
import type { WordImagePosition } from './image-placement.ts';
import { imagePlacement } from './image-placement.ts';
import { xml, xmlAttribute } from './create-xml.ts';
import type { WordShapeDrawing } from './drawings.ts';
export const WORD_SHAPE_PRESETS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'line'] as const;
export interface WordAuthoredShape extends WordImagePosition {
  readonly preset: typeof WORD_SHAPE_PRESETS[number];
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly outline: string;
  readonly outlineWidth: number;
  readonly text?: string;
  readonly alt?: string;
}
export function isWordAuthoredShape(value: unknown): value is WordAuthoredShape {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const shape = value as Record<string, unknown>;
  if (!WORD_SHAPE_PRESETS.some(preset => preset === shape.preset)) return false;
  if (!['width', 'height'].every(k => typeof shape[k] === 'number' && Number.isFinite(shape[k]) && Number(shape[k]) > 0 && Number.isSafeInteger(Math.round(Number(shape[k]) * 12700)))) return false;
  if (!['fill', 'outline'].every(k => typeof shape[k] === 'string' && (shape[k] === 'none' || /^#[\da-f]{6}$/i.test(String(shape[k]))))) return false;
  if (typeof shape.outlineWidth !== 'number' || !Number.isFinite(shape.outlineWidth) || shape.outlineWidth < 0 || !Number.isSafeInteger(Math.round(shape.outlineWidth * 12700))) return false;
  if (['text', 'alt'].some(k => shape[k] !== undefined && (typeof shape[k] !== 'string' || !String(shape[k]).isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(String(shape[k]))))) return false;
  try { imagePlacement(shape as WordImagePosition, Number(shape.width), Number(shape.width)); } catch { return false; }
  return Object.keys(shape).every(k => ['preset','width','height','fill','outline','outlineWidth','text','alt','layout','alignment','moveWithText','x','y'].includes(k));
}
/** Editable DrawingML shape with an ordinary Word text box. No raster fallback. */
export function wordShapeXml(shape: WordAuthoredShape, id: number, availableWidth: number): string {
  if (!isWordAuthoredShape(shape)) throw new TypeError('Invalid shape.');
  const placement = imagePlacement(shape, shape.width, availableWidth);
  const cx = Math.round(shape.width * 12700), cy = Math.round(shape.height * 12700);
  const fill = (color: string) => color === 'none' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${color.slice(1)}"/></a:solidFill>`;
  return `<w:r><w:drawing xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Shape ${id}" descr="${xmlAttribute(shape.alt ?? '')}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${shape.preset}"><a:avLst/></a:prstGeom>${fill(shape.fill)}<a:ln w="${Math.round(shape.outlineWidth * 12700)}">${fill(shape.outline)}</a:ln></wps:spPr>${shape.text === undefined ? '' : `<wps:txbx><w:txbxContent>${shape.text.split(/\r\n?|\n/).map(line => `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('')}</w:txbxContent></wps:txbx>`}<wps:bodyPr anchor="ctr"/></wps:wsp></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`;
}
export function nativeShapeDrawing(elementId: number, shape: WordAuthoredShape, availableWidth: number): WordShapeDrawing {
  if (!isWordAuthoredShape(shape)) throw new TypeError('Invalid shape.');
  const floating = shape.layout && shape.layout !== 'inline';
  return { kind: 'shape', elementId, shape, placement: floating ? 'anchor' : 'inline', widthPoints: shape.width, heightPoints: shape.height, name: 'Shape', altText: shape.alt, anchor: floating ? {
    horizontalRelativeTo: 'column', verticalRelativeTo: shape.moveWithText === false ? 'page' : 'paragraph',
    horizontalOffsetPoints: shape.x ?? (shape.alignment === 'center' ? (availableWidth - shape.width) / 2 : shape.alignment === 'right' ? availableWidth - shape.width : 0), verticalOffsetPoints: shape.y ?? 0,
    wrap: 'none', behindDocument: shape.layout === 'behind', allowOverlap: true, distanceTopPoints: 0, distanceEndPoints: 0, distanceBottomPoints: 0, distanceStartPoints: 0,
  } : undefined };
}

export function validateShapeRun(run: WordTextRun): void {
  if (run.shape && (run.image || run.field || run.breakType || run.tab || run.text !== '\uFFFC')) throw new TypeError('A shape must occupy one object character without another run type.');
}
