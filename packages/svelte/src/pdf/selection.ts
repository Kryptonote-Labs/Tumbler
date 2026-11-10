import { pdfTextCaretAt } from "./pointer-selection.ts";
import type { PdfTextContent } from "@tumblerjs/pdf";

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

/** Expand a double-click using the page's Unicode text rather than browser word boundaries. */
export function selectPdfWord(event: MouseEvent, content: PdfTextContent, layer: HTMLElement) {
  const target = event.target instanceof Element ? event.target.closest("[data-pdf-glyph]") : null;
  const glyph = target?.getAttribute("data-pdf-glyph");
  const caret = glyph ? undefined : pdfTextCaretAt(layer, event.clientX, event.clientY);
  const id = glyph ?? caret?.id;
  if (!id) return;
  let offset = 0;
  for (const item of content.items) {
    if (item.id === id) {
      // At a shared boundary the caret may belong to the preceding space. Advance
      // through whitespace, but keep a clicked glyph inside its own word.
      const within = caret?.offset ?? 0;
      offset += /^\s*$/u.test(item.text) ? within : Math.min(within, Math.max(0, item.text.length - 1));
      break;
    }
    offset += item.text.length;
  }
  const segment = Array.from(
    new Intl.Segmenter(undefined, { granularity: "word" }).segment(content.text),
  ).find((value) => value.index <= offset && value.index + value.segment.length > offset);
  if (!segment) return;
  const range = layer.ownerDocument.createRange();
  let position = 0,
    started = false;
  for (const span of layer.querySelectorAll("[data-pdf-text]")) {
    const node = span.firstChild;
    if (!node) continue;
    const end = position + (node.textContent?.length ?? 0);
    if (!started && end > segment.index) {
      range.setStart(node, segment.index - position);
      started = true;
    }
    if (started && end >= segment.index + segment.segment.length) {
      range.setEnd(node, segment.index + segment.segment.length - position);
      break;
    }
    position = end;
  }
  if (!started) return;
  const selection = layer.ownerDocument.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  event.preventDefault();
}
