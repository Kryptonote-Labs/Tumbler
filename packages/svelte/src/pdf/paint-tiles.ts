import { observePdfPageVisibility } from "./page-visibility.ts";
import type { PdfTextContent } from "@tumblerjs/pdf";
import type { PdfPageRenderer } from "./page-renderer.ts";
type Options = {
  renderer: PdfPageRenderer;
  index: number;
  scale: number;
  width: number;
  height: number;
  ontext: (text: PdfTextContent) => void;
  onerror: (error: Error) => void;
  onpaint?: () => void;
};
const tileSize = 512;

/** Keep a page preview and only the device-resolution tiles around the viewport. */
export function paintPdfTiles(element: HTMLElement, options: Options) {
  let viewport = element.parentElement!;
  while (viewport.parentElement && !/(auto|scroll)/.test(getComputedStyle(viewport).overflowY))
    viewport = viewport.parentElement;
  let visible = false,
    disposed = false,
    running = false,
    again = false;
  let settling: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined,
    controller = new AbortController();
  let preview: HTMLCanvasElement | undefined,
    layer: HTMLDivElement | undefined,
    previous: HTMLDivElement | undefined;
  let rasterScale = 0,
    hasText = false;
  const tiles = new Map<string, HTMLDivElement>();
  const disposeCanvas = (node: HTMLElement | undefined) => {
    if (!node) return;
    for (const canvas of node instanceof HTMLCanvasElement
      ? [node]
      : node.querySelectorAll("canvas")) {
      canvas.width = 0;
      canvas.height = 0;
    }
    node.remove();
  };
  const zooming = () => viewport.hasAttribute("data-pdf-zooming");
  function schedule() {
    if (disposed || !visible || (zooming() && preview)) return;
    again = true;
    if (frame === undefined)
      frame = requestAnimationFrame(() => {
        frame = undefined;
        void render();
      });
  }
  function bitmapCanvas(bitmap: ImageBitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("bitmaprenderer");
    if (context) context.transferFromImageBitmap(bitmap);
    else {
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
    }
    return canvas;
  }
  async function render() {
    if (running || !again || !visible || (zooming() && preview) || disposed) return;
    running = true;
    again = false;
    const active = options,
      signal = controller.signal;
    const ratio = window.devicePixelRatio || 1,
      scale = active.scale * ratio;
    try {
      if (!preview) {
        const small = Math.min(
          scale,
          element.getBoundingClientRect().width / active.width,
          2048 / Math.max(active.width, active.height),
        );
        const result = await active.renderer.render(
          {
            page: active.index,
            scale: small,
            region: {
              x: 0,
              y: 0,
              width: Math.ceil(active.width * small),
              height: Math.ceil(active.height * small),
            },
            text: !hasText && !zooming(),
          },
          signal,
        );
        if (signal.aborted || disposed) {
          result.bitmap.close();
          return;
        }
        preview = bitmapCanvas(result.bitmap);
        Object.assign(preview.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
        });
        element.prepend(preview);
        if (result.text) {
          hasText = true;
          active.ontext(result.text);
        }
      }
      if (zooming() || settling !== undefined) return;
      if (rasterScale !== scale) {
        disposeCanvas(previous);
        previous = layer;
        layer = document.createElement("div");
        Object.assign(layer.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: `${active.width * scale}px`,
          height: `${active.height * scale}px`,
          transformOrigin: "0 0",
          transform: `scale(${active.scale / scale})`,
        });
        layer.dataset.rasterScale = String(scale);
        element.append(layer);
        tiles.clear();
        rasterScale = scale;
      }
      const page = element.getBoundingClientRect(),
        bounds = viewport.getBoundingClientRect();
      const fullWidth = active.width * scale,
        fullHeight = active.height * scale;
      const left = Math.max(0, (bounds.left - page.left - 128) * ratio);
      const top = Math.max(0, (bounds.top - page.top - 128) * ratio);
      const right = Math.min(fullWidth, (bounds.right - page.left + 128) * ratio);
      const bottom = Math.min(fullHeight, (bounds.bottom - page.top + 128) * ratio);
      const wanted = new Set<string>();
      for (let y = Math.floor(top / tileSize) * tileSize; y < bottom; y += tileSize) {
        for (let x = Math.floor(left / tileSize) * tileSize; x < right; x += tileSize) {
          const key = `${x}:${y}`;
          wanted.add(key);
          if (tiles.has(key)) continue;
          const width = Math.min(tileSize, Math.ceil(fullWidth) - x),
            height = Math.min(tileSize, Math.ceil(fullHeight) - y);
          // A one-device-pixel gutter prevents filtering seams between neighbouring tiles.
          const result = await active.renderer.render(
            {
              page: active.index,
              scale,
              region: { x: x - 1, y: y - 1, width: width + 2, height: height + 2 },
              text: !hasText,
            },
            signal,
          );
          if (signal.aborted || disposed) {
            result.bitmap.close();
            return;
          }
          if (settling !== undefined || zooming()) {
            result.bitmap.close();
            return;
          }
          if (result.text) {
            hasText = true;
            active.ontext(result.text);
          }
          const tile = document.createElement("div"),
            canvas = bitmapCanvas(result.bitmap);
          Object.assign(tile.style, {
            position: "absolute",
            overflow: "hidden",
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
          });
          Object.assign(canvas.style, {
            position: "absolute",
            left: "0",
            top: "0",
            transform: "translate(-1px, -1px)",
            width: `${width + 2}px`,
            height: `${height + 2}px`,
          });
          tile.append(canvas);
          layer!.append(tile);
          tiles.set(key, tile);
        }
      }
      for (const [key, tile] of tiles)
        if (!wanted.has(key)) {
          disposeCanvas(tile);
          tiles.delete(key);
        }
      disposeCanvas(previous);
      previous = undefined;
      element.dataset.pdfRendered = String(scale);
      active.onpaint?.();
    } catch (cause) {
      if (!signal.aborted && !disposed)
        active.onerror(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      running = false;
      if (again) schedule();
    }
  }
  function cancel() {
    controller.abort();
    controller = new AbortController();
  }
  function release() {
    cancel();
    delete element.dataset.pdfRendered;
    disposeCanvas(preview);
    disposeCanvas(layer);
    disposeCanvas(previous);
    preview = undefined;
    layer = undefined;
    previous = undefined;
    tiles.clear();
    rasterScale = 0;
    hasText = false;
    options.renderer.release(options.index);
  }
  const stopVisibility = observePdfPageVisibility(element, viewport, (next) => {
    visible = next;
    if (visible) schedule();
    else if (zooming()) cancel();
    else release();
  });
  const resize = new ResizeObserver(schedule);
  resize.observe(viewport);
  // A readable page preview travels with the scroll. Device-resolution tiles resume
  // after motion stops, avoiding a burst of new canvases on every scroll frame.
  const scroll = () => {
    if (settling !== undefined) clearTimeout(settling);
    settling = setTimeout(() => {
      settling = undefined;
      schedule();
    }, 100);
    schedule();
  };
  viewport.addEventListener("scroll", scroll, { passive: true });
  const pauseZoom = () => {
    cancel();
    if (!preview) schedule();
  };
  const finishZoom = () => {
    if (visible) schedule();
    else release();
  };
  viewport.addEventListener("pdfzoomstart", pauseZoom);
  viewport.addEventListener("pdfzoomend", finishZoom);
  window.addEventListener("resize", schedule);
  return {
    update(next: Options) {
      const previousOptions = options;
      if (next.renderer !== previousOptions.renderer || next.index !== previousOptions.index)
        release();
      else if (next.scale !== previousOptions.scale) {
        cancel();
        delete element.dataset.pdfRendered;
      }
      options = next;
      for (const raster of [layer, previous])
        if (raster)
          raster.style.transform = `scale(${options.scale / Number(raster.dataset.rasterScale)})`;
      schedule();
    },
    destroy() {
      disposed = true;
      stopVisibility();
      resize.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", scroll);
      if (settling !== undefined) clearTimeout(settling);
      viewport.removeEventListener("pdfzoomstart", pauseZoom);
      viewport.removeEventListener("pdfzoomend", finishZoom);
      window.removeEventListener("resize", schedule);
      release();
    },
  };
}
