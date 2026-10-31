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
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          return n.parentElement?.closest('[data-bullet]')
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      let n = walker.nextNode();
      while (n) {
        if (left <= n.textContent!.length) return [n, left];
        left -= n.textContent!.length;
        n = walker.nextNode();
      }
      return [p, p.childNodes.length];
    }
    base += length + 1;
  }
  return [node, 0];
}
