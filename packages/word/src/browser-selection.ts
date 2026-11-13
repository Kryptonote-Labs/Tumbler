import type { WordNativePosition, WordNativeSelection } from './native-edit.ts';

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
    return target ? { paragraphId: target.dataset.wordParagraph!, offset: Number(target.dataset.wordStart ?? 0) + (next ? 0 : target.textContent?.length ?? 0) } : undefined;
  }
  if (!root.contains(paragraph)) return;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(paragraph);
  range.setEnd(node, offset);
  return { paragraphId: paragraph.dataset.wordParagraph!, offset: Number(paragraph.dataset.wordStart ?? 0) + range.toString().length };
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
  const paragraph = fragments.find(element => start(element) <= position.offset && position.offset < end(element))
    ?? fragments.findLast(element => end(element) === position.offset);
  if (!paragraph) return;
  const walker = root.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let remaining = position.offset - start(paragraph);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  if (remaining === 0) return { node: paragraph, offset: 0 };
  return;
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

export function wordBrowserPositionAtPoint(root: HTMLElement, x: number, y: number): WordNativePosition | undefined {
  const document = root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = document.caretPositionFromPoint?.(x, y);
  if (caret) return wordPositionFromDom(root, caret.offsetNode, caret.offset);
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? wordPositionFromDom(root, range.startContainer, range.startOffset) : undefined;
}
