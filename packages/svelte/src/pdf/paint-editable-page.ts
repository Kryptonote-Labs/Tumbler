import {
  placePdfScene,
  pdfSourceKey,
  browserPdfPaintHost,
  paintPdfPage,
  type layoutPdfTextFlow,
  type PdfInterpreter,
  type PdfTextModel,
  type PdfEditingFonts,
  type PdfDocument,
  type PdfPageScene,
} from '@tumblerjs/pdf';
import { paintPdfText } from './paint-pdf-text.ts';
import { registerPdfDragPreview } from './pdf-box-preview.ts';
export type PdfPagePaintOptions = {
  index: number;
  scale: number;
  source: number;
  continuation: number;
  interpreter: PdfInterpreter;
  model: PdfTextModel;
  fonts: PdfEditingFonts;
  pdf: PdfDocument;
  flow: ReturnType<typeof layoutPdfTextFlow>;
  selected: readonly string[];
};
type Raster = { background: HTMLCanvasElement; ink: HTMLCanvasElement };

/** Each visible page retains its decoded images and raster while drag previews move only cached ink. */
export function paintEditablePdfPage(canvas: HTMLCanvasElement, options: PdfPagePaintOptions) {
  let visible = false,
    disposed = false,
    scheduled: number | undefined;
  let controller: AbortController | undefined, preparation: AbortController | undefined;
  let host = browserPdfPaintHost();
  let normal: HTMLCanvasElement | undefined;
  let snapshot: { options: PdfPagePaintOptions; scene: PdfPageScene } | undefined;
  let prepared:
    | { key: string; flow: PdfPagePaintOptions['flow']; value: Promise<Raster> }
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
  const surface = () => {
    const result = window.document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    result.width = Math.ceil(
      options.flow.pages[options.index]!.source.width * options.scale * ratio,
    );
    result.height = Math.ceil(
      options.flow.pages[options.index]!.source.height * options.scale * ratio,
    );
    return result;
  };
  function publish(raster: HTMLCanvasElement) {
    // Resizing an unchanged canvas clears it and reallocates its backing store.
    if (canvas.width !== raster.width) canvas.width = raster.width;
    if (canvas.height !== raster.height) canvas.height = raster.height;
    const context = canvas.getContext('2d')!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(raster, 0, 0);
  }
  function clearDrag() {
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
    scene: PdfPageScene,
    active: PdfPagePaintOptions,
    ids: ReadonlySet<string> | undefined,
    ink: boolean,
    signal: AbortSignal,
  ) {
    const scale = active.scale * (window.devicePixelRatio || 1),
      context = target.getContext('2d')!;
    const sources = new Set(
      ids
        ? [...ids].flatMap((id) =>
            active.model.seed(id).sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
          )
        : [],
    );
    const projected = ids
      ? {
          ...scene,
          elements: scene.elements.filter((e) => sources.has(pdfSourceKey(e.source)) === ink),
        }
      : scene;
    await paintPdfPage(context, projected, active.pdf.source, host, {
      scale,
      signal,
      background: ink ? 'transparent' : '#fff',
    });
    signal.throwIfAborted();
    context.setTransform(scale, 0, 0, scale, 0, 0);
    paintPdfText(
      context,
      edited(active).filter((region) => !ids || ids.has(region.id) === ink),
      active.fonts,
    );
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
    const key = local.slice().sort().join('\0');
    if (prepared?.key === key && prepared.flow === current.options.flow) return prepared.value;
    invalidatePreparation();
    preparation = new AbortController();
    const signal = preparation.signal,
      background = surface(),
      ink = surface(),
      selected = new Set(local);
    const value = Promise.all([
      paint(background, current.scene, current.options, selected, false, signal),
      paint(ink, current.scene, current.options, selected, true, signal),
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
        publish(raster.background);
        current.layer?.remove();
        current.layer = raster.ink;
        current.clip ??= window.document.createElement('div');
        Object.assign(current.clip.style, {
          position: 'absolute',
          inset: '0',
          overflow: 'hidden',
          pointerEvents: 'none',
        });
        current.clip.append(raster.ink);
        Object.assign(raster.ink.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          willChange: 'transform',
          transformOrigin: '0 0',
        });
        raster.ink.dataset.pdfDragInk = '';
        page.insertBefore(current.clip, canvas.nextSibling);
        transformDrag();
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error);
      });
  }
  async function render() {
    scheduled = undefined;
    controller?.abort();
    if (!visible || disposed) return;
    const active = options;
    controller = new AbortController();
    const signal = controller.signal;
    const scene = placePdfScene(active.interpreter.page(active.source), active.model);
    const hidden = new Set(
      active.flow.regions
        .filter(
          (region) =>
            region.render &&
            !region.preserveSource &&
            active.model.seed(region.id).page === active.source,
        )
        .flatMap((region) =>
          active.model.seed(region.id).sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
        ),
    );
    const projected = {
      ...scene,
      elements: active.continuation
        ? []
        : scene.elements.filter((e) => !hidden.has(pdfSourceKey(e.source))),
    };
    const raster = surface();
    try {
      await paint(raster, projected, active, undefined, false, signal);
      if (disposed || signal.aborted) return;
      normal = raster;
      snapshot = { options: active, scene: projected };
      if (!drag || drag.ending) {
        publish(raster);
        clearDrag();
      }
      if (drag) showDrag();
      else void prepare(active.selected);
    } catch (error) {
      if (!signal.aborted) console.error(error);
    }
  }
  function schedule() {
    if (scheduled === undefined && !disposed && visible)
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
      if (cancelled && normal) {
        publish(normal);
        clearDrag();
        return;
      }
      drag.ending = true;
      schedule();
    },
  });
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
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
      normal = undefined;
      snapshot = undefined;
      canvas.width = 0;
      canvas.height = 0;
      host.close();
      host = browserPdfPaintHost();
      options.interpreter.releasePage(options.source);
    },
    { rootMargin: '600px 0px' },
  );
  observer.observe(canvas);
  return {
    update(value: PdfPagePaintOptions) {
      const previous = options;
      options = value;
      const changed =
        previous.flow !== value.flow ||
        previous.scale !== value.scale ||
        previous.source !== value.source ||
        previous.continuation !== value.continuation ||
        previous.pdf !== value.pdf;
      if (changed) {
        controller?.abort();
        invalidatePreparation();
        if (previous.pdf !== value.pdf) {
          host.close();
          host = browserPdfPaintHost();
          normal = undefined;
          snapshot = undefined;
        }
        schedule();
      } else if (previous.selected !== value.selected && visible && !drag)
        void prepare(value.selected);
    },
    destroy() {
      disposed = true;
      observer.disconnect();
      unregister();
      controller?.abort();
      invalidatePreparation();
      clearDrag();
      host.close();
      if (scheduled !== undefined) cancelAnimationFrame(scheduled);
    },
  };
}
