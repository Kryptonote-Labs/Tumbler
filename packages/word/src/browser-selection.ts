import type { WordNativePosition, WordNativeSelection } from './native-edit.ts';
import { wordDomPoint } from './browser-dom.ts';

/** DOM paragraphs are host-owned elements carrying their stable native paragraph ID. */
export function wordPositionFromDom(root: HTMLElement, node: Node, offset: number): WordNativePosition | undefined {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const paragraph = element?.closest<HTMLElement>('[data-word-paragraph]');
  if (!paragraph) {
    if (!root.contains(node)) return;
    const boundary = root.ownerDocument.createRange();
    boundary.setStart(node, offset);
    boundary.collapse(true);
    const paragraphs = [...root.querySelectorAll<HTMLElement>('[data-word-paragraph]')];
    const next = paragraphs.find(element => boundary.comparePoint(element, 0) >= 0);
    const target = next ?? paragraphs.at(-1);
    return target ? { paragraphId: target.dataset.wordParagraph!, offset: Number(target.dataset.wordStart ?? 0) + (next ? 0 : target.textContent?.length ?? 0), affinity: next ? 'before' : 'after' } : undefined;
  }
  if (!root.contains(paragraph)) return;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(paragraph);
  range.setEnd(node, offset);
  const local = range.toString().length;
  return { paragraphId: paragraph.dataset.wordParagraph!, offset: Number(paragraph.dataset.wordStart ?? 0) + local, affinity: local === 0 ? 'before' : 'after' };
}

export function wordBrowserSelection(root: HTMLElement): WordNativeSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return;
  const anchor = wordPositionFromDom(root, selection.anchorNode, selection.anchorOffset);
  const focus = wordPositionFromDom(root, selection.focusNode, selection.focusOffset);
  return anchor && focus ? { anchor, focus } : undefined;
}

function domPosition(root: HTMLElement, position: WordNativePosition) {
  const candidates = [...root.querySelectorAll<HTMLElement>('[data-word-paragraph]')]
    .filter(element => element.dataset.wordParagraph === position.paragraphId);
  // Fragment ranges take precedence over line wrappers and may continue on another page.
  const fragments = candidates.filter(element => !element.querySelector('[data-word-paragraph]'));
  const start = (element: HTMLElement) => Number(element.dataset.wordStart ?? 0);
  const end = (element: HTMLElement) => start(element) + (element.textContent?.length ?? 0);
  const preceding = () => fragments.findLast(element => start(element) < position.offset && position.offset <= end(element));
  const following = () => fragments.find(element => start(element) <= position.offset && position.offset < end(element));
  const paragraph = (position.affinity === 'after' ? preceding() ?? following() : following() ?? preceding())
    ?? fragments.findLast(element => end(element) === position.offset);
  if (!paragraph) return;
  return wordDomPoint(paragraph, position.offset - start(paragraph));
}

/** Call after the framework has committed the updated paragraph DOM. Retains backward selections. */
export function restoreWordBrowserSelection(root: HTMLElement, selection: WordNativeSelection): void {
  const anchor = domPosition(root, selection.anchor);
  const focus = domPosition(root, selection.focus);
  if (anchor && focus) root.ownerDocument.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

/** Browser-shaped DOM geometry, in viewport CSS pixels. Canvas hosts need layout-based geometry. */
export function wordBrowserSelectionRects(root: HTMLElement, selection: WordNativeSelection): readonly DOMRect[] {
  const anchor = domPosition(root, selection.anchor);
  const focus = domPosition(root, selection.focus);
  if (!anchor || !focus) return [];
  const range = root.ownerDocument.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.collapse(true);
  const other = root.ownerDocument.createRange();
  other.setStart(focus.node, focus.offset);
  other.collapse(true);
  if (range.compareBoundaryPoints(Range.START_TO_START, other) <= 0) range.setEnd(focus.node, focus.offset);
  else { range.setStart(focus.node, focus.offset); range.setEnd(anchor.node, anchor.offset); }
  return [...range.getClientRects()];
}

/** Unspecified affinity accepts either visual caret at the same logical position. */
export function sameWordBrowserSelection(left: WordNativeSelection | undefined, right: WordNativeSelection): boolean {
  const same = (left: WordNativePosition, right: WordNativePosition) => left.paragraphId === right.paragraphId && left.offset === right.offset &&
    (left.affinity === undefined || right.affinity === undefined || left.affinity === right.affinity);
  return left !== undefined && same(left.anchor, right.anchor) && same(left.focus, right.focus);
}
