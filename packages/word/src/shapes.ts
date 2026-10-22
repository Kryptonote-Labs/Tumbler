import { drawingColourXml } from './theme-colour-xml.ts';
import { isWordColour, type WordColour } from './theme-colours.ts';
import { shapeTextParagraphs, isShapeTextBody } from './shape-text.ts';
import type { WordTextParagraph } from './create.ts';
import type { WordTextRun } from './create.ts';
import type { WordImagePosition } from './image-placement.ts';
import { imagePlacement } from './image-placement.ts';
import { xmlAttribute } from './create-xml.ts';
import type { WordShapeDrawing } from './drawings.ts';
import { isWordShapeTextInsets, wordShapeTextInsetsXml, type WordShapeTextInsets } from './shape-text-insets.ts';
export const WORD_SHAPE_PRESETS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'line'] as const;
export interface WordAuthoredShape extends WordImagePosition {
  readonly preset: typeof WORD_SHAPE_PRESETS[number];
  readonly width: number;
  readonly height: number;
  readonly fill: WordColour;
  readonly outline: WordColour;
  readonly outlineWidth: number;
  readonly text?: string;
  /** Rich text takes precedence over the legacy plain text value. */
  readonly textBody?: readonly WordTextParagraph[];
  readonly textAnchor?: 'top' | 'center' | 'bottom';
  /** Internal text margins in points, independent of paragraph spacing. */
  readonly textInsets?: WordShapeTextInsets;
  readonly alt?: string;
}
export function isWordAuthoredShape(value: unknown): value is WordAuthoredShape {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const shape = value as Record<string, unknown>;
  if (!WORD_SHAPE_PRESETS.some(preset => preset === shape.preset)) return false;
  if (!['width', 'height'].every(k => typeof shape[k] === 'number' && Number.isFinite(shape[k]) && Number(shape[k]) > 0 && Number.isSafeInteger(Math.round(Number(shape[k]) * 12700)))) return false;
  if (!['fill', 'outline'].every(k => shape[k] === 'none' || isWordColour(shape[k]))) return false;
  if (typeof shape.outlineWidth !== 'number' || !Number.isFinite(shape.outlineWidth) || shape.outlineWidth < 0 || !Number.isSafeInteger(Math.round(shape.outlineWidth * 12700))) return false;
  if (['text', 'alt'].some(k => shape[k] !== undefined && (typeof shape[k] !== 'string' || !String(shape[k]).isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(String(shape[k]))))) return false;
  if (shape.textBody !== undefined && !isShapeTextBody(shape.textBody)) return false;
  if (shape.textAnchor !== undefined && !['top', 'center', 'bottom'].includes(String(shape.textAnchor))) return false;
  if (shape.textInsets !== undefined && !isWordShapeTextInsets(shape.textInsets)) return false;
  try { imagePlacement(shape as WordImagePosition, Number(shape.width), Number(shape.width)); } catch { return false; }
  return Object.keys(shape).every(k => ['preset','width','height','fill','outline','outlineWidth','text','textBody','textAnchor','textInsets','alt','layout','alignment','moveWithText','wrap','horizontalRelativeTo','verticalRelativeTo','x','y'].includes(k));
}
/**
 * The shape's outline as an SVG path in its own point space, inset by one point so strokes stay
 * inside the frame. SVG and canvas heads both draw this path.
 */
export function wordShapePath(shape: Pick<WordAuthoredShape, 'preset' | 'width' | 'height'>): string {
  const { width: w, height: h } = shape;
  const right = Math.max(1, w - 1), bottom = Math.max(1, h - 1);
  switch (shape.preset) {
    case 'rect': return `M1 1 H${right} V${bottom} H1 Z`;
    case 'roundRect': {
      const r = Math.min(Math.min(w, h) * .12, (right - 1) / 2, (bottom - 1) / 2);
      return `M${1 + r} 1 H${right - r} A${r} ${r} 0 0 1 ${right} ${1 + r} V${bottom - r} A${r} ${r} 0 0 1 ${right - r} ${bottom} H${1 + r} A${r} ${r} 0 0 1 1 ${bottom - r} V${1 + r} A${r} ${r} 0 0 1 ${1 + r} 1 Z`;
    }
    case 'ellipse': {
      const rx = Math.max(0, w / 2 - 1), ry = Math.max(0, h / 2 - 1);
      return `M${w / 2 - rx} ${h / 2} A${rx} ${ry} 0 1 0 ${w / 2 + rx} ${h / 2} A${rx} ${ry} 0 1 0 ${w / 2 - rx} ${h / 2} Z`;
    }
    case 'triangle': return `M${w / 2} 1 L${right} ${bottom} L1 ${bottom} Z`;
    case 'diamond': return `M${w / 2} 1 L${right} ${h / 2} L${w / 2} ${bottom} L1 ${h / 2} Z`;
    case 'rightArrow': return `M1 ${h * .3} H${w * .6} V1 L${right} ${h / 2} L${w * .6} ${bottom} V${h * .7} H1 Z`;
    case 'line': return `M1 ${bottom} L${right} 1`;
  }
}
/** Missing placement means a newly authored shape. Imported shapes carry an explicit layout. */
function defaultShapePlacement(shape: WordAuthoredShape): WordAuthoredShape {
  return shape.layout === undefined ? { ...shape, layout: 'front', moveWithText: false, horizontalRelativeTo: 'page', verticalRelativeTo: 'page' } : shape;
}
/** Editable DrawingML shape with an ordinary Word text box. No raster fallback. */
export function wordShapeXml(shape: WordAuthoredShape, id: number, availableWidth: number, renderText: (paragraphs: readonly WordTextParagraph[]) => string): string {
  if (!isWordAuthoredShape(shape)) throw new TypeError('Invalid shape.');
  shape = defaultShapePlacement(shape);
  const placement = imagePlacement(shape, shape.width, availableWidth);
  const cx = Math.round(shape.width * 12700), cy = Math.round(shape.height * 12700);
  const fill = (color: WordColour) => color === 'none' ? '<a:noFill/>' : `<a:solidFill>${drawingColourXml(color)}</a:solidFill>`;
  return `<w:r><w:drawing xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Shape ${id}" descr="${xmlAttribute(shape.alt ?? '')}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${shape.preset}"><a:avLst/></a:prstGeom>${fill(shape.fill)}<a:ln w="${Math.round(shape.outlineWidth * 12700)}">${fill(shape.outline)}</a:ln></wps:spPr>${shape.text === undefined && shape.textBody === undefined ? '' : `<wps:txbx><w:txbxContent>${renderText(shapeTextParagraphs(shape))}</w:txbxContent></wps:txbx>`}<wps:bodyPr${wordShapeTextInsetsXml(shape.textInsets)} anchor="${shape.textAnchor === 'top' ? 't' : shape.textAnchor === 'bottom' ? 'b' : 'ctr'}"/></wps:wsp></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`;
}
export function nativeShapeDrawing(elementId: number, shape: WordAuthoredShape, availableWidth: number): WordShapeDrawing {
  if (!isWordAuthoredShape(shape)) throw new TypeError('Invalid shape.');
  shape = defaultShapePlacement(shape);
  const floating = shape.layout && shape.layout !== 'inline';
  return { kind: 'shape', elementId, shape, placement: floating ? 'anchor' : 'inline', widthPoints: shape.width, heightPoints: shape.height, name: 'Shape', altText: shape.alt, anchor: floating ? {
    horizontalRelativeTo: shape.horizontalRelativeTo ?? 'column', verticalRelativeTo: shape.verticalRelativeTo ?? (shape.moveWithText === false ? 'page' : 'paragraph'),
    horizontalOffsetPoints: shape.x ?? (shape.alignment === 'center' ? (availableWidth - shape.width) / 2 : shape.alignment === 'right' ? availableWidth - shape.width : 0), verticalOffsetPoints: shape.y ?? 0,
    wrap: 'none', behindDocument: shape.layout === 'behind', layoutInCell: true, allowOverlap: true, distanceTopPoints: 0, distanceEndPoints: 0, distanceBottomPoints: 0, distanceStartPoints: 0,
  } : undefined };
}

export function validateShapeRun(run: WordTextRun): void {
  if (run.shape && (run.image || run.field || run.breakType || run.tab || run.text !== '\uFFFC')) throw new TypeError('A shape must occupy one object character without another run type.');
}
