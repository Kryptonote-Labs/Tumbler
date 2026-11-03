import {
  layoutPdfTextFlow,
  pdfSourceKey,
  browserPdfPaintHost,
  paintPdfPage,
  type PdfInterpreter,
  type PdfTextModel,
  type PdfEditingFonts,
  type PdfDocument,
} from '@tumblerjs/pdf';
export type PdfPagePaintOptions = {
  index: number;
  scale: number;
  source: number;
  continuation: number;
  interpreter: PdfInterpreter;
  model: PdfTextModel;
  fonts: PdfEditingFonts;
  pdf: PdfDocument;
};
export function paintEditablePdfPage(canvas: HTMLCanvasElement, options: PdfPagePaintOptions) {
  let { interpreter, model, fonts, pdf, scale } = options;
  let page = options.source,
    continuation = options.continuation;
  let visible = false;
  let disposed = false,
    controller: AbortController | undefined;
  const render = () => {
    controller?.abort();
    if (!visible) {
      canvas.width = 0;
      canvas.height = 0;
      interpreter.releasePage(page);
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    const scene = interpreter.page(page),
      currentFlow = layoutPdfTextFlow(model, fonts, pdf.pages),
      hidden = new Set(
        currentFlow.regions
          .filter((region) => region.render && model.seed(region.id).page === page)
          .flatMap((region) =>
            model.seed(region.id).sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
          ),
      );
    const projected = {
      ...scene,
      elements: continuation
        ? []
        : scene.elements.filter((e) => !hidden.has(pdfSourceKey(e.source))),
    };
    const host = browserPdfPaintHost(),
      ratio = window.devicePixelRatio || 1,
      staging = window.document.createElement('canvas');
    staging.width = Math.ceil(scene.width * scale * ratio);
    staging.height = Math.ceil(scene.height * scale * ratio);
    void paintPdfPage(staging.getContext('2d')!, projected, pdf.source, host, {
      scale: scale * ratio,
      signal,
    })
      .then(() => {
        if (disposed || signal.aborted) return;
        canvas.width = staging.width;
        canvas.height = staging.height;
        canvas.getContext('2d')!.drawImage(staging, 0, 0);
      })
      .catch((error) => {
        if (!signal.aborted) console.error(error);
      })
      .finally(() => host.close());
  };
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      render();
    },
    { rootMargin: '600px 0px' },
  );
  observer.observe(canvas);
  model.doc.on('afterTransaction', render);
  return {
    update(value: PdfPagePaintOptions) {
      ({ interpreter, model, fonts, pdf, scale } = value);
      page = value.source;
      continuation = value.continuation;
      render();
    },
    destroy() {
      disposed = true;
      observer.disconnect();
      controller?.abort();
      model.doc.off('afterTransaction', render);
    },
  };
}
