import type { InkBounds } from '@tumblerjs/ink';
import { beginLosslessXmlEdit, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { InkMatrix } from './ink-transform.ts';

const children = (node: LosslessXmlElement) => node.children.filter((child): child is LosslessXmlElement => child.kind === 'element');

/** Rebase the content transform after changing source bounds, leaving document placement fixed. */
export function preserveInkTransform(source: LosslessXmlDocument, contentId: number, matrix: InkMatrix, bounds: InkBounds, drawingNamespace: string) {
  const content = source.element(contentId)!;
  const transform = children(content).find(node => node.namespaceUri === content.namespaceUri && node.localName === 'xfrm');
  const [a, b, c, d, e, f] = matrix;
  const sourceWidth = bounds.width || 72 / 2540, sourceHeight = bounds.height || 72 / 2540;
  const width = Math.hypot(a, b) * sourceWidth, height = Math.hypot(c, d) * sourceHeight;
  const cx = bounds.x + sourceWidth / 2, cy = bounds.y + sourceHeight / 2;
  const x = a * cx + c * cy + e - width / 2, y = b * cx + d * cy + f - height / 2;
  const emu = (value: number, positive = false) => {
    const result = Math.round(value * 12700);
    if (!Number.isSafeInteger(result) || (positive && result <= 0)) throw new RangeError('Edited ink transform is outside the measurement range.');
    return String(result);
  };
  const editor = beginLosslessXmlEdit(source);
  const geometry = `<a:off xmlns:a="${drawingNamespace}" x="${emu(x)}" y="${emu(y)}"/><a:ext xmlns:a="${drawingNamespace}" cx="${emu(width, true)}" cy="${emu(height, true)}"/>`;
  // Existing transforms can carry rotation, reflection and unknown extension attributes.
  if (transform && !transform.selfClosing) {
    for (const name of ['off', 'ext']) {
      const child = children(transform).find(node => node.namespaceUri === drawingNamespace && node.localName === name);
      const values = name === 'off' ? { x: emu(x), y: emu(y) } : { cx: emu(width, true), cy: emu(height, true) };
      if (child) for (const [key, value] of Object.entries(values)) {
        const attribute = child.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === key);
        if (attribute) editor.setAttribute(attribute, value); else editor.insertAttribute(child, key, value);
      }
      else {
        const markup = name === 'off' ? geometry.slice(0, geometry.indexOf('/>') + 2) : geometry.slice(geometry.indexOf('/>') + 2);
        const ext = children(transform).find(node => node.namespaceUri === drawingNamespace && node.localName === 'ext');
        if (name === 'off' && ext) editor.insertMarkupBefore(ext, markup); else editor.appendMarkup(transform, markup);
      }
    }
  } else if (transform) {
    const start = source.source.slice(transform.startTagSpan.start, transform.startTagSpan.end).replace(/\/\s*>$/, '>');
    editor.replaceElementMarkup(transform, `${start}${geometry}</${transform.qualified}>`);
  } else {
    const markup = `<w14:xfrm xmlns:w14="${content.namespaceUri}">${geometry}</w14:xfrm>`;
    if (content.selfClosing) {
      const start = source.source.slice(content.startTagSpan.start, content.startTagSpan.end).replace(/\/\s*>$/, '>');
      editor.replaceElementMarkup(content, `${start}${markup}</${content.qualified}>`);
    } else editor.appendMarkup(content, markup);
  }
  return editor.commit().bytes;
}
