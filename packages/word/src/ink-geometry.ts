import { refreshWordInkFallback } from './ink-edit.ts';
import { openWordArtifact } from './artifact.ts';
import { wordStoryArtifact } from './stories.ts';
import { beginLosslessXmlEdit, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { WordError, type WordDocument } from './document.ts';
import type { WordDrawingChange, WordDrawingResize, WordImageDrawing } from './drawings.ts';
import { wordInkChoice, wordInkNamespaces } from './ink-fallback.ts';

const EMU = 12700;
const vml = 'urn:schemas-microsoft-com:vml';
const word2010 = 'http://schemas.microsoft.com/office/word/2010/wordml';
type Editor = ReturnType<typeof beginLosslessXmlEdit>;
const children = (element: LosslessXmlElement): LosslessXmlElement[] => element.children.filter((node): node is LosslessXmlElement => node.kind === 'element');
const descendants = (element: LosslessXmlElement): LosslessXmlElement[] => children(element).flatMap(child => [child, ...descendants(child)]);
const attr = (element: LosslessXmlElement, name: string) => element.attributes.find(a => !a.namespaceUri && a.localName === name);

/** The bitmap bounds include the pen; the native frame can be smaller and offset within them. */
export function inkFrame(element: LosslessXmlElement) {
  return wordInkChoice(element) ?? element;
}
function placement(element: LosslessXmlElement) {
  const frame = inkFrame(element);
  const wp = wordInkNamespaces(frame).drawing.replace(/main$/, 'wordprocessingDrawing');
  const node = children(frame).find(node => node.namespaceUri === wp && ['anchor', 'inline'].includes(node.localName));
  if (!node) throw new WordError('invalid_document', 'Ink placement is missing.');
  return node;
}
function nativeOffset(element: LosslessXmlElement, axis: 'H' | 'V') {
  const position = children(placement(element)).find(node => node.localName === `position${axis}`);
  const offset = position && children(position).find(node => node.localName === 'posOffset');
  const text = offset?.children.map(node => node.kind === 'text' ? node.value : '').join('');
  return text === undefined ? 0 : Number(text) / EMU;
}
function setNumber(editor: Editor, element: LosslessXmlElement, name: string, value: number, positive = false) {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || (positive && rounded <= 0)) throw new RangeError('Ink geometry is outside the supported measurement range.');
  const attribute = attr(element, name);
  if (!attribute) throw new WordError('invalid_document', `Ink ${name} is missing.`);
  editor.setAttribute(attribute, String(rounded));
}
function fallbackShape(element: LosslessXmlElement) {
  const fallback = children(element).find(node => node.namespaceUri === 'http://schemas.openxmlformats.org/markup-compatibility/2006' && node.localName === 'Fallback');
  const shapes = fallback && descendants(fallback).filter(node => node.namespaceUri === vml && node.localName === 'shape');
  return shapes?.length === 1 ? shapes[0] : undefined;
}
function fallbackMeasurement(element: LosslessXmlElement, name: string): number | undefined {
  const shape = fallbackShape(element), style = shape && attr(shape, 'style')?.value;
  const raw = style?.split(';').find(entry => entry.slice(0, entry.indexOf(':')).trim().toLowerCase() === name)?.split(':').slice(1).join(':').trim();
  const match = raw && /^(-?(?:\d+(?:\.\d*)?|\.\d+))(pt|in|cm|mm|px)?$/.exec(raw);
  if (!match) return undefined;
  return Number(match[1]) * ({ pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: .75 }[match[2] ?? 'pt'] ?? 1);
}
function editStyle(editor: Editor, element: LosslessXmlElement, values: Readonly<Record<string, string | undefined>>) {
  const shape = fallbackShape(element);
  if (!shape) return;
  const style = attr(shape, 'style');
  if (!style) throw new WordError('invalid_document', 'Ink fallback style is missing.');
  const retained = style.value.split(';').filter(value => !(value.slice(0, value.indexOf(':')).trim().toLowerCase() in values));
  editor.setAttribute(style, [...retained.filter(Boolean), ...Object.entries(values).flatMap(([key, value]) => value === undefined ? [] : [`${key}:${value}`])].join(';'));
}

/** Resize the native frame and regenerate its preview with the physical pen unchanged. */
export function resizeWordInk(document: WordDocument, element: LosslessXmlElement, drawing: WordImageDrawing, size: WordDrawingResize) {
  const sx = size.widthPoints / drawing.widthPoints, sy = size.heightPoints / drawing.heightPoints;
  const frame = inkFrame(element);
  const namespaces = wordInkNamespaces(frame);
  const editor = beginLosslessXmlEdit(document.source);
  const nodes = descendants(frame);
  const extent = children(placement(element)).find(node => node.localName === 'extent');
  if (!extent) throw new WordError('invalid_document', 'Ink extent is missing.');
  for (const [name, scale] of [['cx', sx], ['cy', sy]] as const) setNumber(editor, extent, name, Number(attr(extent, name)?.value) * scale, true);
  const effect = children(placement(element)).find(node => node.localName === 'effectExtent');
  if (effect) for (const [name, scale] of [['l', sx], ['r', sx], ['t', sy], ['b', sy]] as const)
    setNumber(editor, effect, name, Number(attr(effect, name)?.value) * scale);
  // contentPart uses w14:xfrm with DrawingML off/ext children, not a:xfrm.
  for (const transform of nodes.filter(node => node.namespaceUri === word2010 && node.localName === 'xfrm')) {
    for (const node of children(transform).filter(node => node.namespaceUri === namespaces.drawing)) {
      if (node.localName !== 'ext' && node.localName !== 'off') continue;
      const axes = node.localName === 'ext' ? [['cx', sx], ['cy', sy]] as const : [['x', sx], ['y', sy]] as const;
      for (const [name, scale] of axes)
        setNumber(editor, node, name, Number(attr(node, name)?.value) * scale, node.localName === 'ext');
    }
  }
  // Keep the preview origin fixed while scaling the inset of the native frame.
  for (const [axis, scale, origin] of [['H', sx, drawing.anchor?.horizontalOffsetPoints ?? 0], ['V', sy, drawing.anchor?.verticalOffsetPoints ?? 0]] as const) {
    const position = children(placement(element)).find(node => node.localName === `position${axis}`);
    const offset = position && children(position).find(node => node.localName === 'posOffset');
    if (offset) {
      const value = Math.round((origin + (nativeOffset(element, axis) - origin) * scale) * EMU);
      if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) throw new RangeError('Ink position must fit a signed 32-bit EMU offset.');
      editor.setText(offset, String(value));
    }
  }
  const fallbackX = fallbackMeasurement(element, 'margin-left'), fallbackY = fallbackMeasurement(element, 'margin-top');
  const originX = drawing.anchor?.horizontalOffsetPoints ?? 0, originY = drawing.anchor?.verticalOffsetPoints ?? 0;
  editStyle(editor, element, {
    width: `${(fallbackMeasurement(element, 'width') ?? drawing.widthPoints) * sx}pt`,
    height: `${(fallbackMeasurement(element, 'height') ?? drawing.heightPoints) * sy}pt`,
    ...(fallbackX === undefined ? {} : { 'margin-left': `${originX + (fallbackX - originX) * sx}pt` }),
    ...(fallbackY === undefined ? {} : { 'margin-top': `${originY + (fallbackY - originY) * sy}pt` }),
  });
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  const bytes = transaction.commit();
  if (!fallbackShape(element) || !drawing.inkProjection) return bytes;
  const artifact = openWordArtifact(bytes, { inkRendering: document.inkRendering });
  const resized = document.source.root.localName === 'document' ? artifact : wordStoryArtifact(artifact, document.part.name.value);
  return refreshWordInkFallback(resized.document, element.id);
}

/** Translate display coordinates to native frame coordinates and stage the matching VML placement. */
export function positionWordInk(editor: Editor, element: LosslessXmlElement, drawing: WordImageDrawing, change: WordDrawingChange): WordDrawingChange {
  const inline = change.layout === 'inline';
  const horizontal = change.horizontalRelativeTo ?? 'page';
  const vertical = change.verticalRelativeTo ?? 'page';
  editStyle(editor, element, {
    position: inline ? undefined : 'absolute',
    'margin-left': inline ? undefined : `${(change.xPoints ?? 0) + (fallbackMeasurement(element, 'margin-left') ?? drawing.anchor?.horizontalOffsetPoints ?? 0) - (drawing.anchor?.horizontalOffsetPoints ?? 0)}pt`,
    'margin-top': inline ? undefined : `${(change.yPoints ?? 0) + (fallbackMeasurement(element, 'margin-top') ?? drawing.anchor?.verticalOffsetPoints ?? 0) - (drawing.anchor?.verticalOffsetPoints ?? 0)}pt`,
    'mso-position-horizontal': undefined, 'mso-position-vertical': undefined,
    'mso-position-horizontal-relative': inline ? undefined : horizontal === 'column' ? 'text' : horizontal,
    'mso-position-vertical-relative': inline ? undefined : vertical === 'paragraph' ? 'text' : vertical,
    ...(inline ? { 'z-index': undefined } : change.layout !== (drawing.anchor?.behindDocument ? 'behind' : 'front') ? { 'z-index': change.layout === 'behind' ? '-1' : '1' } : {}),
  });
  const shape = fallbackShape(element);
  const wrap = shape && children(shape).find(node => node.namespaceUri === 'urn:schemas-microsoft-com:office:word' && node.localName === 'wrap');
  if (wrap) {
    if (inline || change.wrap === 'none' || change.layout !== (drawing.anchor?.behindDocument ? 'behind' : 'front')) {
      editor.replaceElementMarkup(wrap, '');
    } else {
      for (const [name, value] of [['anchorx', horizontal === 'column' ? 'text' : horizontal], ['anchory', vertical === 'paragraph' ? 'text' : vertical]] as const) {
        const attribute = attr(wrap, name);
        if (attribute) editor.setAttribute(attribute, value);
        else editor.insertAttribute(wrap, name, value);
      }
    }
  }
  return {
    ...change,
    xPoints: (change.xPoints ?? 0) + (drawing.placement === 'inline' ? 0 : nativeOffset(element, 'H') - (drawing.anchor?.horizontalOffsetPoints ?? 0)),
    yPoints: (change.yPoints ?? 0) + (drawing.placement === 'inline' ? 0 : nativeOffset(element, 'V') - (drawing.anchor?.verticalOffsetPoints ?? 0)),
  };
}
