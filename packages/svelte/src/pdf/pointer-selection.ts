import { PdfTextSelectionIndex, type PdfTextContent } from "@tumblerjs/pdf";

interface Caret {
  node: Node;
  offset: number;
}
const layers = new WeakMap<
  HTMLElement,
  { content: PdfTextContent; index: PdfTextSelectionIndex; nodes: Map<string, Node> }
>();

/** Keep the headless hit-test index paired with the mounted browser text nodes. */
export function registerPdfTextLayer(layer: HTMLElement, content: PdfTextContent) {
  const nodes = new Map<string, Node>();
  for (const span of layer.querySelectorAll<HTMLElement | SVGElement>("[data-pdf-text]")) {
    const id = span.getAttribute("data-pdf-text-id");
    if (span.firstChild && id) nodes.set(id, span.firstChild);
  }
  layers.set(layer, { content, index: new PdfTextSelectionIndex(content), nodes });
  return () => {
    layers.delete(layer);
  };
}
/** Resolve a screen point through the same geometry used by native drag endpoints. */
export function pdfTextCaretAt(layer: HTMLElement, x: number, y: number) {
  const entry = layers.get(layer), rect = layer.getBoundingClientRect();
  if (!entry || !rect.width || !rect.height) return;
  return entry.index.caretAt(((x-rect.left)*entry.content.width)/rect.width, ((y-rect.top)*entry.content.height)/rect.height);
}

function caretAt(host: HTMLElement, x: number, y: number): Caret | undefined {
  let closest: HTMLElement | undefined,
    best = Infinity;
  for (const layer of host.querySelectorAll<HTMLElement>("[data-pdf-text-layer]")) {
    if (!layers.has(layer)) continue;
    const rect = layer.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const distance = Math.hypot(
      Math.max(rect.left - x, 0, x - rect.right),
      Math.max(rect.top - y, 0, y - rect.bottom),
    );
    if (distance < best) {
      closest = layer;
      best = distance;
    }
  }
  if (!closest) return;
  const entry = layers.get(closest)!;
  const caret = pdfTextCaretAt(closest, x, y);
  const node = caret && entry.nodes.get(caret.id);
  return node && caret ? { node, offset: caret.offset } : undefined;
}

/** Correct native drag endpoints before paint. The browser retains highlighting, copying and autoscroll. */
export function trackPdfSelection(host: HTMLElement) {
  const document = host.ownerDocument,
    window = document.defaultView!;
  let dragging = false;
  let anchor: Caret | undefined,
    point: { x: number; y: number } | undefined,
    frame: number | undefined;
  const update = () => {
    frame = undefined;
    if (!dragging || !anchor?.node.isConnected || !point) return;
    const focus = caretAt(host, point.x, point.y),
      selection = window.getSelection();
    if (!focus || !selection) return;
    if (
      selection.anchorNode === anchor.node &&
      selection.anchorOffset === anchor.offset &&
      selection.focusNode === focus.node &&
      selection.focusOffset === focus.offset
    )
      return;
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  };
  const schedule = () => {
    if (dragging && anchor && frame === undefined) frame = window.requestAnimationFrame(update);
  };
  const stop = () => {
    anchor = undefined;
    point = undefined;
    dragging = false;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const down = (event: MouseEvent) => {
    stop();
    if (
      event.button !== 0 ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      !(event.target instanceof Element) ||
      !event.target.closest("[data-pdf-text-layer]")
    )
      return;
    const selection = window.getSelection();
    anchor =
      event.shiftKey && selection?.anchorNode && host.contains(selection.anchorNode)
        ? { node: selection.anchorNode, offset: selection.anchorOffset }
        : caretAt(host, event.clientX, event.clientY);
    point = { x: event.clientX, y: event.clientY };
    dragging = event.shiftKey;
    schedule();
  };
  const move = (event: MouseEvent) => {
    if (!(event.buttons & 1)) {
      stop();
      return;
    }
    if (!anchor || !point) return;
    if (!dragging && Math.hypot(event.clientX - point.x, event.clientY - point.y) < 3) return;
    dragging = true;
    point = { x: event.clientX, y: event.clientY };
    schedule();
  };
  const up = (event: MouseEvent) => {
    if (anchor && dragging) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      point = { x: event.clientX, y: event.clientY };
      update();
    }
    stop();
  };
  // Starting a new selection inside the previous highlight must not become an HTML text drag.
  const drag = (event: DragEvent) => {
    if (anchor) event.preventDefault();
  };
  host.addEventListener("dragstart", drag);
  host.addEventListener("mousedown", down);
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.addEventListener("selectionchange", schedule);
  document.addEventListener("scroll", schedule, true);
  window.addEventListener("blur", stop);
  return () => {
    stop();
    host.removeEventListener("dragstart", drag);
    host.removeEventListener("mousedown", down);
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.removeEventListener("selectionchange", schedule);
    document.removeEventListener("scroll", schedule, true);
    window.removeEventListener("blur", stop);
  };
}
