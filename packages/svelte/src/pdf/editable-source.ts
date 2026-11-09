import { pdfScenePlacements } from "@tumblerjs/pdf";
import type { PdfPagePaintOptions } from "./paint-editable-page.ts";
import type { PdfTileRequest } from "./render-protocol.ts";

function request(
  active: PdfPagePaintOptions,
  ids?: ReadonlySet<string>,
  ink = false,
): PdfTileRequest {
  const page = active.flow.pages[active.index]!.source;
  const scale = active.scale * (window.devicePixelRatio || 1);
  const hidden = active.flow.regions
    .filter(
      (region) =>
        region.render &&
        !region.preserveSource &&
        active.model.seed(region.id).page === active.source,
    )
    .flatMap((region) =>
      active.model
        .seed(region.id)
        .sources.map((source) => `${source.instance}/${source.object}/${source.start}`),
    );
  const selected = ids
    ? [...ids].flatMap((id) =>
        active.model
          .seed(id)
          .sources.map((source) => `${source.instance}/${source.object}/${source.start}`),
      )
    : [];
  const snapshot = active.model.pages.records.get(page.id)?.get('snapshot');
  return {
    page: active.source,
    scale,
    region: {
      x: 0,
      y: 0,
      width: Math.ceil(page.width * scale),
      height: Math.ceil(page.height * scale),
    },
    projection: {
      placements: pdfScenePlacements(active.model, active.source),
      exclude: [...new Set([...hidden, ...(!ink ? selected : [])])],
      ...(ids && ink ? { include: selected } : {}),
      transparent: ink,
      ...(snapshot instanceof Uint8Array && !active.continuation ? { snapshot } : {}),
      ...(active.continuation || (active.source < 0 && !(snapshot instanceof Uint8Array))
        ? { blank: { width: page.width, height: page.height } }
        : {}),
    },
  };
}

/** Worker-owned source raster; editing glyphs and selection stay in the interactive view. */
export class PdfEditableSource {
  private cached:
    | {
        key: string;
        renderer: PdfPagePaintOptions["renderer"];
        controller: AbortController;
        value: Promise<ImageBitmap>;
      }
    | undefined;
  clear() {
    const previous = this.cached;
    this.cached = undefined;
    if (!previous) return;
    previous.controller.abort();
    void previous.value.then((bitmap) => bitmap.close()).catch(() => {});
  }
  async render(
    active: PdfPagePaintOptions,
    ids: ReadonlySet<string>,
    ink: boolean,
    signal: AbortSignal,
  ) {
    return (await active.renderer.render(request(active, ids, ink), signal)).bitmap;
  }
  async bitmap(active: PdfPagePaintOptions, signal: AbortSignal) {
    const tile = request(active);
    const key = JSON.stringify(tile);
    if (!this.cached || this.cached.key !== key || this.cached.renderer !== active.renderer) {
      this.clear();
      const controller = new AbortController();
      const value = active.renderer.render(tile, controller.signal).then(({ bitmap }) => bitmap);
      const entry = { key, renderer: active.renderer, controller, value };
      this.cached = entry;
      void value.catch(() => {
        if (this.cached === entry) this.cached = undefined;
      });
    }
    const bitmap = await this.cached.value;
    signal.throwIfAborted();
    return bitmap;
  }
}
