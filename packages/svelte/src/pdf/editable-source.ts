import { pdfScenePlacements } from '@tumblerjs/pdf';
import type { PdfPagePaintOptions } from './paint-editable-page.ts';
import type { PdfTileRequest } from './render-protocol.ts';

function request(active: PdfPagePaintOptions, ids?: ReadonlySet<string>, ink = false): PdfTileRequest {
  const page = active.flow.pages[active.index]!.source;
  const scale = active.scale * (window.devicePixelRatio || 1);
  const hidden = active.flow.regions.filter((region) =>
    region.render && !region.preserveSource && active.model.seed(region.id).page === active.source,
  ).flatMap((region) => active.model.seed(region.id).sources.map((source) =>
    `${source.instance}/${source.object}/${source.start}`,
  ));
  const selected = ids ? [...ids].flatMap((id) => active.model.seed(id).sources.map((source) =>
    `${source.instance}/${source.object}/${source.start}`,
  )) : [];
  return {
    page: active.source, scale,
    region: { x: 0, y: 0, width: Math.ceil(page.width * scale), height: Math.ceil(page.height * scale) },
    projection: {
      placements: pdfScenePlacements(active.model, active.source),
      exclude: [...new Set([...hidden, ...(!ink ? selected : [])])],
      ...(ids && ink ? { include: selected } : {}),
      transparent: ink,
      ...(active.continuation || active.source < 0 ? { blank: { width: page.width, height: page.height } } : {}),
    },
  };
}

/** Worker-owned source raster; editing glyphs and selection stay in the interactive view. */
export class PdfEditableSource {
  private cached: {
    key: string;
    renderer: PdfPagePaintOptions['renderer'];
    controller: AbortController;
    value: Promise<ImageBitmap>;
  } | undefined;
  clear() {
    const previous = this.cached;
    this.cached = undefined;
    if (!previous) return;
    previous.controller.abort();
    void previous.value.then((bitmap) => bitmap.close()).catch(() => {});
  }
  async paint(context: CanvasRenderingContext2D, active: PdfPagePaintOptions,
    ids: ReadonlySet<string> | undefined, ink: boolean, signal: AbortSignal) {
    const tile = request(active, ids, ink);
    if (ids) {
      const { bitmap } = await active.renderer.render(tile, signal);
      try { signal.throwIfAborted(); context.drawImage(bitmap, 0, 0); }
      finally { bitmap.close(); }
      return;
    }
    const key = JSON.stringify(tile);
    if (!this.cached || this.cached.key !== key || this.cached.renderer !== active.renderer) {
      this.clear();
      const controller = new AbortController();
      const value = active.renderer.render(tile, controller.signal).then(({ bitmap }) => bitmap);
      const entry = { key, renderer: active.renderer, controller, value };
      this.cached = entry;
      void value.catch(() => { if (this.cached === entry) this.cached = undefined; });
    }
    const bitmap = await this.cached.value;
    signal.throwIfAborted();
    context.drawImage(bitmap, 0, 0);
  }
}
