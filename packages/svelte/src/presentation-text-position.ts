/** Resolve semantic text offsets without counting bullets as document text. */
export function presentationTextPosition(
  node: HTMLElement,
  paragraphs: readonly string[],
  position: number,
): [Node, number] {
  const ps = Array.from(node.querySelectorAll<HTMLElement>('[data-text-paragraph]'));
  let base = 0;
  for (let i = 0; i < ps.length; i++) {
    const length = paragraphs[i]?.length ?? 0;
    if (position <= base + length || i === ps.length - 1) {
      const p = ps[i]!;
      let left = Math.max(0, Math.min(length, position - base));
      // Equations are one character; carets sit beside them, never inside.
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n instanceof Element)
            return n.hasAttribute('data-text-equation') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          return n.parentElement?.closest('[data-bullet], [data-text-equation]')
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      let n = walker.nextNode();
      while (n) {
        if (n instanceof Element) {
          const parent = n.parentNode!, index = Array.prototype.indexOf.call(parent.childNodes, n);
          if (left === 0) return [parent, index];
          left -= 1;
          if (left === 0) return [parent, index + 1];
        } else {
          if (left <= n.textContent!.length) return [n, left];
          left -= n.textContent!.length;
        }
        n = walker.nextNode();
      }
      return [p, p.childNodes.length];
    }
    base += length + 1;
  }
  return [node, 0];
}
