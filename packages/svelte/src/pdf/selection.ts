/** Read only the selected PDF text nodes, excluding page chrome and layout whitespace. */
export function selectedPdfText(selection: Selection | null, host: Element): string | undefined {
  if (
    !selection ||
    selection.isCollapsed ||
    !selection.rangeCount ||
    !host.contains(selection.anchorNode) ||
    !host.contains(selection.focusNode)
  )
    return;
  const range = selection.getRangeAt(0),
    pages: string[] = [];
  for (const layer of host.querySelectorAll("[data-pdf-text-layer]")) {
    if (!range.intersectsNode(layer)) continue;
    const parts: string[] = [];
    for (const item of layer.querySelectorAll("[data-pdf-text]")) {
      if (!range.intersectsNode(item)) continue;
      const bounds = item.ownerDocument.createRange();
      bounds.selectNodeContents(item);
      const selected = range.cloneRange();
      if (selected.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
        selected.setStart(bounds.startContainer, bounds.startOffset);
      if (selected.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
        selected.setEnd(bounds.endContainer, bounds.endOffset);
      parts.push(selected.toString());
    }
    const text = parts.join("");
    if (text) pages.push(text);
  }
  return pages.length ? pages.join("\n") : undefined;
}
