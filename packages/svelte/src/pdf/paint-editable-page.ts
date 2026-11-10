import type { layoutPdfTextFlow, PdfTextModel, PdfEditingFonts, PdfDocument } from "@tumblerjs/pdf";
import type { PdfPageRenderer } from "./page-renderer.ts";
import { PdfEditableSource } from "./editable-source.ts";
import { observePdfPageVisibility } from "./page-visibility.ts";
import { paintPdfText } from "./paint-pdf-text.ts";
import { registerPdfDragPreview } from "./pdf-box-preview.ts";
export type PdfPagePaintOptions = {
  index: number;
  scale: number;
  source: number;
  continuation: number;
  renderer: PdfPageRenderer;
  model: PdfTextModel;
  fonts: PdfEditingFonts;
  pdf: PdfDocument;
  flow: ReturnType<typeof layoutPdfTextFlow>;
  selected: readonly string[];
  onvisible?: (visible: boolean) => void;
};
type Raster = { background: HTMLCanvasElement; ink: HTMLCanvasElement };

/** Each visible page retains its decoded images and raster while drag previews move only cached ink. */
export function paintEditablePdfPage(canvas: HTMLCanvasElement, options: PdfPagePaintOptions) {
  let visible = false,
    disposed = false,
    scheduled: number | undefined;
  let controller: AbortController | undefined, preparation: AbortController | undefined;
  const source = new PdfEditableSource();
  const background = document.createElement("canvas");
  background.setAttribute("aria-hidden", "true");
  Object.assign(background.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  Object.assign(canvas.style, { position: "absolute", inset: "0" });
  canvas.before(background);
  let displayed: ImageBitmap | undefined;
  let ink:
    | {
        regions: ReturnType<typeof layoutPdfTextFlow>["regions"];
        scale: number;
        fonts: PdfEditingFonts;
        fontRevision: number;
      }
    | undefined;
  let snapshot: { options: PdfPagePaintOptions } | undefined;
  let prepared:
    | { key: string; flow: PdfPagePaintOptions["flow"]; value: Promise<Raster> }
    | undefined;
  let drag:
    | {
        ids: readonly string[];
        dx: number;
        dy: number;
        ending: boolean;
        layer?: HTMLCanvasElement;
        clip?: HTMLDivElement;
      }
    | undefined;
  const page = canvas.parentElement!;
  let viewport = page.parentElement!;
  while (viewport.parentElement && !/(auto|scroll)/.test(getComputedStyle(viewport).overflowY))
    viewport = viewport.parentElement;
  const pauseZoom = () => {
    controller?.abort();
    invalidatePreparation();
    if (scheduled !== undefined) {
      cancelAnimationFrame(scheduled);
      scheduled = undefined;
    }
  };
  viewport.addEventListener("pdfzoomstart", pauseZoom);
  viewport.addEventListener("pdfzoomend", schedule);
  const surface = () => {
    const result = window.document.createElement("canvas");
    const ratio = window.devicePixelRatio || 1;
    result.width = Math.ceil(
      options.flow.pages[options.index]!.source.width * options.scale * ratio,
    );
    result.height = Math.ceil(
      options.flow.pages[options.index]!.source.height * options.scale * ratio,
    );
    return result;
  };
  function clearDrag() {
    background.style.visibility = "";
    canvas.style.visibility = "";
    drag?.clip?.remove();
    drag = undefined;
  }
  function invalidatePreparation() {
    preparation?.abort();
    prepared = undefined;
  }
  function edited(active: PdfPagePaintOptions) {
    return active.flow.regions.filter(
      (region) => region.render && region.page === active.index && !region.preserveSource,
    );
  }
  async function paint(
    target: HTMLCanvasElement,
    active: PdfPagePaintOptions,
    ids: ReadonlySet<string> | undefined,
    ink: boolean,
    signal: AbortSignal,
  ) {
    const bitmap = await source.render(active, ids ?? new Set(), ink, signal);
    try {
      signal.throwIfAborted();
      const regions = edited(active).filter((region) => !ids || ids.has(region.id) === ink);
      const bitmapContext = !regions.length && target.getContext("bitmaprenderer");
      if (bitmapContext) bitmapContext.transferFromImageBitmap(bitmap);
      else {
        const context = target.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        const scale = active.scale * (window.devicePixelRatio || 1);
        context.setTransform(scale, 0, 0, scale, 0, 0);
        paintPdfText(context, regions, active.fonts);
      }
    } finally {
      bitmap.close();
    }
  }

  function prepare(ids: readonly string[]) {
    const current = snapshot;
    if (!current) return;
    const local = ids.filter((id) =>
      current.options.flow.regions.some((r) => r.id === id && r.page === current.options.index),
    );
    if (!local.length) {
      invalidatePreparation();
      return;
    }
    const key = local.slice().sort().join("\0");
    if (prepared?.key === key && prepared.flow === current.options.flow) return prepared.value;
    invalidatePreparation();
    preparation = new AbortController();
    const signal = preparation.signal,
      background = surface(),
      ink = surface(),
      selected = new Set(local);
    const value = Promise.all([
      paint(background, current.options, selected, false, signal),
      paint(ink, current.options, selected, true, signal),
    ]).then(() => ({ background, ink }));
    // Selection can change while image decoding or a page paint is pending.
    void value.catch(() => {});
    prepared = { key, flow: current.options.flow, value };
    return value;
  }
  function transformDrag() {
    if (drag?.layer)
      drag.layer.style.transform = `translate(${drag.dx * options.scale}px, ${drag.dy * options.scale}px)`;
  }
  function showDrag() {
    const current = drag;
    if (!current || current.ending) return;
    const ready = prepare(current.ids);
    if (!ready) return;
    void ready
      .then((raster) => {
        if (disposed || drag !== current || current.ending) return;
        background.style.visibility = "hidden";
        canvas.style.visibility = "hidden";
        current.layer?.remove();
        current.layer = raster.ink;
        current.clip ??= window.document.createElement("div");
        Object.assign(current.clip.style, {
          position: "absolute",
          inset: "0",
          overflow: "hidden",
          pointerEvents: "none",
        });
        Object.assign(raster.background.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        });
        current.clip.replaceChildren(raster.background, raster.ink);
        Object.assign(raster.ink.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          willChange: "transform",
          transformOrigin: "0 0",
        });
        raster.ink.dataset.pdfDragInk = "";
        page.insertBefore(current.clip, canvas.nextSibling);
        transformDrag();
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      });
  }
  async function render() {
    scheduled = undefined;
    controller?.abort();
    if (!visible || disposed) return;
    const active = options;
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const bitmap = await source.bitmap(active, signal);
      if (disposed || signal.aborted) return;
      if (displayed !== bitmap) {
        const copy = await createImageBitmap(bitmap);
        if (disposed || signal.aborted) {
          copy.close();
          return;
        }
        if (background.width !== copy.width) background.width = copy.width;
        if (background.height !== copy.height) background.height = copy.height;
        const context = background.getContext("bitmaprenderer");
        if (context) context.transferFromImageBitmap(copy);
        else {
          background.getContext("2d")!.drawImage(copy, 0, 0);
          copy.close();
        }
        displayed = bitmap;
      }
      const regions = edited(active);
      if (
        !ink ||
        ink.scale !== active.scale ||
        ink.fonts !== active.fonts ||
        ink.fontRevision !== active.fonts.revision ||
        ink.regions.length !== regions.length ||
        regions.some((region, index) => region.glyphs !== ink!.regions[index]!.glyphs)
      ) {
        if (regions.length) {
          if (canvas.width !== background.width) canvas.width = background.width;
          if (canvas.height !== background.height) canvas.height = background.height;
          const context = canvas.getContext("2d")!;
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          const scale = active.scale * (window.devicePixelRatio || 1);
          context.setTransform(scale, 0, 0, scale, 0, 0);
          paintPdfText(context, regions, active.fonts);
        } else {
          canvas.width = 0;
          canvas.height = 0;
        }
        ink = {
          regions,
          scale: active.scale,
          fonts: active.fonts,
          fontRevision: active.fonts.revision,
        };
      }
      background.dataset.pdfRendered = String(active.scale * (window.devicePixelRatio || 1));
      snapshot = { options: active };
      if (!drag || drag.ending) clearDrag();
      if (drag) showDrag();
      else void prepare(active.selected);
    } catch (error) {
      if (!signal.aborted) console.error(error);
    }
  }
  function schedule() {
    if (
      scheduled === undefined &&
      !disposed &&
      visible &&
      !viewport.hasAttribute("data-pdf-zooming")
    )
      scheduled = requestAnimationFrame(() => void render());
  }
  const unregister = registerPdfDragPreview(page, {
    begin(ids) {
      if (!options.flow.regions.some((r) => r.page === options.index && ids.includes(r.id))) return;
      clearDrag();
      drag = { ids, dx: 0, dy: 0, ending: false };
      showDrag();
    },
    move(dx, dy) {
      if (drag && !drag.ending) {
        drag.dx = dx;
        drag.dy = dy;
        transformDrag();
      }
    },
    finish(cancelled) {
      if (!drag) return;
      if (cancelled) {
        clearDrag();
        return;
      }
      drag.ending = true;
      schedule();
    },
  });
  const stopVisibility = observePdfPageVisibility(canvas, viewport, (next) => {
    visible = next;
    options.onvisible?.(visible);
    if (visible) {
      schedule();
      return;
    }
    controller?.abort();
    invalidatePreparation();
    drag?.clip?.remove();
    if (drag) {
      delete drag.layer;
      delete drag.clip;
    }
    source.clear();
    displayed = undefined;
    ink = undefined;
    background.width = 0;
    background.height = 0;
    delete background.dataset.pdfRendered;
    snapshot = undefined;
    canvas.width = 0;
    canvas.height = 0;
    if (options.source >= 0 && !options.continuation) options.renderer.release(options.source);
  });
  return {
    update(value: PdfPagePaintOptions) {
      const previous = options;
      options = value;
      const changed =
        previous.flow !== value.flow ||
        previous.scale !== value.scale ||
        previous.source !== value.source ||
        previous.continuation !== value.continuation ||
        previous.pdf !== value.pdf ||
        previous.renderer !== value.renderer;
      if (changed) {
        controller?.abort();
        invalidatePreparation();
        if (previous.pdf !== value.pdf || previous.renderer !== value.renderer) {
          source.clear();
          displayed = undefined;
          ink = undefined;
          background.width = 0;
          background.height = 0;
          delete background.dataset.pdfRendered;
          snapshot = undefined;
        }
        schedule();
      } else if (previous.selected !== value.selected && visible && !drag)
        void prepare(value.selected);
    },
    destroy() {
      source.clear();
      background.width = 0;
      background.height = 0;
      background.remove();
      disposed = true;
      viewport.removeEventListener("pdfzoomstart", pauseZoom);
      viewport.removeEventListener("pdfzoomend", schedule);
      stopVisibility();
      unregister();
      controller?.abort();
      invalidatePreparation();
      clearDrag();
      if (options.source >= 0 && !options.continuation) options.renderer.release(options.source);
      if (scheduled !== undefined) cancelAnimationFrame(scheduled);
    },
  };
}
