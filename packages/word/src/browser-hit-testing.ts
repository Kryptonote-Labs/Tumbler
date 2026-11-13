import type { WordNativePosition } from './native-edit.ts';
import { wordDomPoint } from './browser-dom.ts';

/** Nearest rendered text position, clamped to visible grapheme boundaries even in page margins. */
export function wordBrowserPositionAtPoint(root: HTMLElement, x: number, y: number): WordNativePosition | undefined {
  const range = root.ownerDocument.createRange();
  let target: HTMLElement | undefined;
  let vertical = Infinity;
  let horizontal = Infinity;
  for (const element of root.querySelectorAll<HTMLElement>('[data-word-paragraph]')) {
    const blocked = element.closest('[contenteditable="false"]');
    if (element.querySelector('[data-word-paragraph]') || blocked && root.contains(blocked)) continue;
    range.selectNodeContents(element);
    const textBounds = range.getBoundingClientRect();
    const bounds = textBounds.height ? textBounds : element.getBoundingClientRect();
    if (!bounds.height || !element.getClientRects().length) continue;
    const dy = Math.max(bounds.top - y, y - bounds.bottom, 0);
    const dx = Math.max(bounds.left - x, x - bounds.right, 0);
    if (dy < vertical || dy === vertical && dx < horizontal) {
      target = element;
      vertical = dy;
      horizontal = dx;
    }
  }
  if (!target) return;
  const text = target.textContent ?? '';
  const boundaries = [0, ...[...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(segment => segment.index + segment.segment.length)];
  let nearest = 0;
  let distance = Infinity;
  for (const offset of boundaries) {
    const point = wordDomPoint(target, offset);
    if (!point) continue;
    range.setStart(point.node, point.offset);
    range.collapse(true);
    const bounds = range.getBoundingClientRect();
    // Collapsed browser ranges retain shaping and bidi caret geometry.
    const caretX = bounds.height ? bounds.x : target.getBoundingClientRect().left;
    const delta = Math.abs(caretX - x);
    if (delta < distance) { distance = delta; nearest = offset; }
  }
  return { paragraphId: target.dataset.wordParagraph!, offset: Number(target.dataset.wordStart ?? 0) + nearest, affinity: nearest === 0 ? 'before' : 'after' };
}
