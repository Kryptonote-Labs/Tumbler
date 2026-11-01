/** Resolve the linear transform from text layout coordinates to screen coordinates. */
function textMatrix(node: Element) {
  let matrix = new DOMMatrix();
  let element: Element | null = node;
  while (element && !(element instanceof SVGGraphicsElement)) {
    const transform = getComputedStyle(element).transform;
    if (transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
    element = element.parentElement;
  }
  const screen = element instanceof SVGGraphicsElement ? element.getScreenCTM() : undefined;
  return screen
    ? new DOMMatrix([screen.a, screen.b, screen.c, screen.d, screen.e, screen.f]).multiply(matrix)
    : matrix;
}

/** Empty lines have no Range rectangles. Measure a zero-width glyph in a detached layout
 * copy, so browser alignment, indentation, bullets and writing mode still position the caret.
 * The live document DOM and its browser selection are never changed.
 */
function emptyCaret(range: Range) {
  const container = range.endContainer;
  const element = container instanceof Element ? container : container.parentElement;
  const paragraph = element?.closest<HTMLElement>('[data-text-paragraph]');
  if (!paragraph) return;
  const mirror = paragraph.cloneNode(true) as HTMLElement;
  const computed = getComputedStyle(paragraph);
  for (const property of computed)
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  Object.assign(mirror.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    margin: '0',
    transform: 'none',
    visibility: 'hidden',
    pointerEvents: 'none',
    transition: 'none',
    animation: 'none',
  });
  mirror.removeAttribute('id');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.inert = true;
  mirror.querySelectorAll('br').forEach((node) => node.remove());
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);
  try {
    const box = mirror.getBoundingClientRect();
    const glyph = marker.getBoundingClientRect();
    const matrix = textMatrix(paragraph);
    const local = (x: number, y: number) => new DOMPoint(x, y, 0, 0).matrixTransform(matrix);
    const corners = [
      [0, 0],
      [box.width, 0],
      [box.width, box.height],
      [0, box.height],
    ].map(([x, y]) => local(x!, y!));
    const actual = paragraph.getBoundingClientRect();
    const ox = actual.left - Math.min(...corners.map((point) => point.x));
    const oy = actual.top - Math.min(...corners.map((point) => point.y));
    const point = (x: number, y: number) => {
      const transformed = local(x - box.left, y - box.top);
      return { x: ox + transformed.x, y: oy + transformed.y };
    };
    const vertical = computed.writingMode.startsWith('vertical');
    return {
      start: point(glyph.left, glyph.top),
      end: point(vertical ? glyph.right : glyph.left, vertical ? glyph.top : glyph.bottom),
    };
  } finally {
    mirror.remove();
  }
}

/** A collapsed browser range supplies the caret centre; transforms supply its direction.
 * Using the bounding rectangle's left edge would put rotated and vertical carets off the text.
 */
export function presentationTextCaret(node: HTMLElement, range: Range) {
  const rect = range.getClientRects()[0];
  if (!rect || (!rect.width && !rect.height)) return emptyCaret(range);
  const matrix = textMatrix(node);
  const vertical = getComputedStyle(node).writingMode.startsWith('vertical');
  const direction = new DOMPoint(vertical ? 1 : 0, vertical ? 0 : 1, 0, 0).matrixTransform(matrix);
  const magnitude = Math.hypot(direction.x, direction.y);
  if (!magnitude) return;
  const length = Math.hypot(rect.width, rect.height);
  const dx = ((direction.x / magnitude) * length) / 2;
  const dy = ((direction.y / magnitude) * length) / 2;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return { start: { x: cx - dx, y: cy - dy }, end: { x: cx + dx, y: cy + dy } };
}
