type Point = { x: number; y: number };
export type PdfZoomAnchor = Point & {
  page: HTMLElement;
  /** Position in unscaled PDF page points. */
  offsetX: number;
  offsetY: number;
};

/** Preview a zoom with one compositor transform per frame. Commit layout only when it settles.
 * The caller must synchronously apply the new scale and restore the supplied page anchor. */
export function pdfZoomPreview(
  viewport: HTMLElement,
  getScale: () => number,
  commit: (scale: number, anchor: PdfZoomAnchor) => void,
) {
  let preview:
    | {
        root: HTMLElement;
        page: HTMLElement;
        origin: Point;
        pageOrigin: Point;
        base: number;
        scale: number;
        factor: number;
        tx: number;
        ty: number;
        point: Point;
        transform: string;
        willChange: string;
        transformOrigin: string;
        bounds: {
          left: number;
          top: number;
          width: number;
          height: number;
          maxWidth: number;
          pageWidth: number;
          totalHeight: number;
          prefix: number;
          gap: number;
          count: number;
          index: number;
          padLeft: number;
          padRight: number;
          padTop: number;
          padBottom: number;
        };
      }
    | undefined;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clampToScrollBounds() {
    if (!preview) return;
    const p = preview,
      b = p.bounds;
    const offsetX = ((p.point.x - p.origin.x - p.tx) / p.factor - p.pageOrigin.x) / p.base;
    const offsetY = ((p.point.y - p.origin.y - p.ty) / p.factor - p.pageOrigin.y) / p.base;
    const width = Math.max(b.width, b.maxWidth * p.scale + b.padLeft + b.padRight);
    const height = b.totalHeight * p.scale + b.gap * (b.count - 1) + b.padTop + b.padBottom;
    const left = b.padLeft + (width - b.padLeft - b.padRight - b.pageWidth * p.scale) / 2;
    const top = b.padTop + b.prefix * p.scale + b.index * b.gap;
    const x = left + offsetX * p.scale - (p.point.x - b.left),
      y = top + offsetY * p.scale - (p.point.y - b.top);
    // Match native scroll clamping while content fits, rather than jumping when the pinch ends.
    p.tx += x - Math.max(0, Math.min(Math.max(0, width - b.width), x));
    p.ty += y - Math.max(0, Math.min(Math.max(0, height - b.height), y));
  }
  function paint() {
    frame = undefined;
    if (preview)
      preview.root.style.transform = `translate(${preview.tx}px, ${preview.ty}px) scale(${preview.factor})`;
  }
  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(paint);
    clearTimeout(timer);
    timer = setTimeout(finish, 140);
  }
  function restore() {
    if (!preview) return;
    const { root, transform, willChange, transformOrigin } = preview;
    root.style.transform = transform;
    root.style.willChange = willChange;
    root.style.transformOrigin = transformOrigin;
  }
  function finish() {
    clearTimeout(timer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (!preview) return;
    const p = preview;
    // Invert the preview transform to find the PDF point under the latest focal point.
    const localX = (p.point.x - p.origin.x - p.tx) / p.factor;
    const localY = (p.point.y - p.origin.y - p.ty) / p.factor;
    const visible = p.page.isConnected && p.page.getClientRects().length > 0;
    restore();
    preview = undefined;
    try {
      if (visible)
        commit(p.scale, {
          page: p.page,
          x: p.point.x,
          y: p.point.y,
          offsetX: (localX - p.pageOrigin.x) / p.base,
          offsetY: (localY - p.pageOrigin.y) / p.base,
        });
    } finally {
      viewport.removeAttribute('data-pdf-zooming');
      viewport.dispatchEvent(new Event('pdfzoomend'));
    }
  }
  function zoom(next: number, point?: Point) {
    if (!preview) {
      const root = viewport.querySelector<HTMLElement>('[data-pdf-document]');
      if (!root) return;
      const bounds = viewport.getBoundingClientRect();
      point ??= {
        x: bounds.left + viewport.clientWidth / 2,
        y: bounds.top + viewport.clientHeight / 2,
      };
      const pages = root.querySelectorAll<HTMLElement>('[data-pdf-page]');
      if (!pages.length) return;
      let low = 0,
        high = pages.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pages[middle]!.getBoundingClientRect().bottom < point.y) low = middle + 1;
        else high = middle;
      }
      const index = Math.min(low, pages.length - 1),
        page = pages[index]!;
      const origin = root.getBoundingClientRect(),
        pageBounds = page.getBoundingClientRect();
      const base = getScale();
      const style = getComputedStyle(root),
        number = (value: string) => Number.parseFloat(value) || 0;
      const padLeft = number(style.paddingLeft),
        padRight = number(style.paddingRight),
        padTop = number(style.paddingTop),
        padBottom = number(style.paddingBottom),
        gap = number(style.rowGap);
      const width = viewport.clientWidth,
        height = viewport.clientHeight;
      const layout = {
        left: bounds.left + viewport.clientLeft,
        top: bounds.top + viewport.clientTop,
        width,
        height,
        maxWidth: Number(root.dataset.pdfMaxWidth) || pageBounds.width / base,
        pageWidth: pageBounds.width / base,
        totalHeight: (origin.height - padTop - padBottom - gap * (pages.length - 1)) / base,
        prefix: (pageBounds.top - origin.top - padTop - index * gap) / base,
        gap,
        count: pages.length,
        index,
        padLeft,
        padRight,
        padTop,
        padBottom,
      };

      preview = {
        root,
        page,
        bounds: layout,
        origin: { x: origin.left, y: origin.top },
        pageOrigin: { x: pageBounds.left - origin.left, y: pageBounds.top - origin.top },
        base,
        scale: base,
        factor: 1,
        tx: 0,
        ty: 0,
        point,
        transform: root.style.transform,
        willChange: root.style.willChange,
        transformOrigin: root.style.transformOrigin,
      };
      viewport.setAttribute('data-pdf-zooming', '');
      viewport.dispatchEvent(new Event('pdfzoomstart'));
      root.style.transformOrigin = '0 0';
      root.style.willChange = 'transform';
    }
    const p = preview;
    point ??= p.point;
    const scale = Math.max(0.1, Math.min(8, next)),
      factor = scale / p.base;
    const change = factor / p.factor;
    p.tx = point.x - p.origin.x - (point.x - p.origin.x - p.tx) * change;
    p.ty = point.y - p.origin.y - (point.y - p.origin.y - p.ty) * change;
    p.factor = factor;
    p.scale = scale;
    p.point = point;
    clampToScrollBounds();
    schedule();
  }
  return {
    get scale() {
      return preview?.scale ?? getScale();
    },
    zoom,
    finish,
    pan(dx: number, dy: number) {
      if (!preview) return;
      preview.tx += dx;
      preview.ty += dy;
      preview.point = { x: preview.point.x + dx, y: preview.point.y + dy };
      clampToScrollBounds();
      schedule();
    },
    destroy() {
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      restore();
      preview = undefined;
      viewport.removeAttribute('data-pdf-zooming');
    },
  };
}
