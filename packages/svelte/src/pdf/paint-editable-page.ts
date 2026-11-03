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
  fonts.importDocument(pdf);
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
        const context = staging.getContext('2d')!;
        context.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
        for (const region of currentFlow.regions.filter(
          (region) => region.render && region.page === options.index,
        ))
          for (const glyph of region.glyphs) {
            if (glyph.text === '\n') continue;
            const shaped = fonts.shape(glyph.text, glyph.style),
              em = glyph.style.size / shaped.face.font.unitsPerEm;
            let x = glyph.x;
            for (let i = 0; i < shaped.glyphs.length; i++) {
              const position = shaped.positions[i]!,
                outline = shaped.glyphs[i]!;
              context.save();
              context.translate(x + position.xOffset * em, glyph.y - position.yOffset * em);
              context.scale(em, -em);
              if (shaped.italic) context.transform(1, 0, 0.2, 1, 0, 0);
              context.fillStyle = glyph.style.color;
              const path = new Path2D(outline.path.toSVG());
              context.fill(path);
              if (shaped.bold) {
                context.strokeStyle = glyph.style.color;
                context.lineWidth = shaped.face.font.unitsPerEm * 0.025;
                context.stroke(path);
              }
              context.restore();
              x += position.xAdvance * em;
            }
            if (glyph.style.underline) {
              context.strokeStyle = glyph.style.color;
              context.lineWidth = glyph.style.size / 16;
              context.beginPath();
              context.moveTo(glyph.x, glyph.y + glyph.style.size * 0.12);
              context.lineTo(glyph.x + glyph.width, glyph.y + glyph.style.size * 0.12);
              context.stroke();
            }
          }
        // Publish background removal and replacement text in one canvas swap.
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
      options = value;
      ({ interpreter, model, fonts, pdf, scale } = value);
      fonts.importDocument(pdf);
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
