/** Resolve a UTF-16 text offset within a rendered fragment, including nested text nodes. */
export function wordDomPoint(element: HTMLElement, offset: number) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return remaining === 0 ? { node: element, offset: 0 } : undefined;
}

/** Only the root editing host owns Word input; nested controls and editors own their events. */
export function wordBrowserOwnsTarget(root: HTMLElement, target: EventTarget | null | undefined): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : undefined;
  return !!element && root.contains(element) && element.closest('[contenteditable]') === root &&
    !element.closest('input,textarea,select,button');
}
