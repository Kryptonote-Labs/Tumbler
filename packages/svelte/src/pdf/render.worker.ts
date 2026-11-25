import { PdfCompatibilityRaster } from './compatibility-raster.ts';
import compatibilityWasm from '@hyzyla/pdfium/pdfium.wasm?url';
import {
  openPdfDocument,
  PdfError,
  PdfInterpreter,
  paintPdfPage,
  browserPdfPaintHost,
  pdfTextContent,
  placePdfSceneSources,
  pdfSourceKey,
} from "@tumblerjs/pdf";
import { extendPdfTileEdges } from "./tile-edges.ts";
import type { PdfRenderRequest, PdfRenderResponse } from "./render-protocol.ts";
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PdfRenderRequest>) => void) | null;
  postMessage(message: PdfRenderResponse, transfer?: Transferable[]): void;
};
let interpreter: PdfInterpreter | undefined;
let openError: string | undefined;
let compatibility: Promise<PdfCompatibilityRaster> | undefined;
const compatibilityPages = new Set<number>();
const hosts = new Map<number, ReturnType<typeof browserPdfPaintHost>>();
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "open") {
    try {
      openError = undefined;
      void compatibility?.then((renderer) => renderer.close()).catch(() => {});
      compatibility = undefined;
      compatibilityPages.clear();
      interpreter = new PdfInterpreter(
        openPdfDocument(
          message.input.bytes,
          message.input.password === undefined ? {} : { password: message.input.password },
        ),
        message.limits,
      );
    } catch (cause) {
      openError = cause instanceof Error ? cause.message : String(cause);
    }
    return;
  }
  if (message.type === "release") {
    hosts.get(message.page)?.close();
    hosts.delete(message.page);
    interpreter?.releasePage(message.page);
    void compatibility?.then((renderer) => renderer.release(message.page)).catch(() => {});
    return;
  }
  void render(message);
};
async function render(message: Extract<PdfRenderRequest, { type: "render" }>) {
  try {
    if (!interpreter) throw new Error(openError ?? "PDF renderer is not open.");
    const { page, scale, region } = message.tile;
    const projection = message.tile.projection;
    const source = projection?.snapshot ? new PdfInterpreter(openPdfDocument(projection.snapshot)) : interpreter;
    const sourcePage = source.document.pages[projection?.snapshot ? 0 : page];
    const canUseCompatibility = !projection?.blank &&
      !projection?.transparent && !projection?.include &&
      !projection?.exclude.length && !projection?.placements.length;
    const canvas = new OffscreenCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    let text: ReturnType<typeof pdfTextContent> | undefined;
    let compatibilityRendered = false;
    let needsCompatibility = !projection?.snapshot && compatibilityPages.has(page);
    if (!canUseCompatibility || !needsCompatibility) {
      try {
        let scene = projection?.blank ? undefined : source.page(projection?.snapshot ? 0 : page);
        if (scene && projection) {
          const placed = placePdfSceneSources(scene, projection.placements);
          const excluded = new Set(projection.exclude);
          const included = projection.include && new Set(projection.include);
          scene = {
            ...placed,
            elements: placed.elements.filter(
              (element) =>
                !projection.excludeAnnotations?.some(id => element.source.instance === id || element.source.instance.startsWith(id + ':')) &&
                !excluded.has(pdfSourceKey(element.source)) &&
                (!included || included.has(pdfSourceKey(element.source))),
            ),
          };
        }
        if (scene) {
          let host = hosts.get(page);
          if (!host) {
            host = browserPdfPaintHost();
            hosts.set(page, host);
          }
          await paintPdfPage(context, scene, source.document.source, host, {
            scale,
            region,
            background: projection?.transparent ? "transparent" : "#fff",
          });
          if (message.tile.text) text = pdfTextContent(scene);
        } else if (!projection?.transparent) {
          context.fillStyle = "#fff";
          context.fillRect(0, 0, region.width, region.height);
        }
      } catch (error) {
        if (!canUseCompatibility || !sourcePage || !(error instanceof PdfError) ||
            (error.code !== "resource_limit" && error.code !== "unsupported_feature"))
          throw error;
        hosts.get(page)?.close();
        hosts.delete(page);
        source.releasePage(projection?.snapshot ? 0 : page);
        needsCompatibility = true;
        if (!projection?.snapshot) compatibilityPages.add(page);
      }
    }
    if (canUseCompatibility && sourcePage && needsCompatibility) {
      const renderer = await (compatibility ??= PdfCompatibilityRaster.open(
        interpreter.document.source.renderInput(), compatibilityWasm,
      ));
      const snapshot = projection?.snapshot && renderer.openSnapshot(projection.snapshot);
      try {
        const pixels = snapshot
          ? snapshot.render({ ...message.tile, page: 0 }, sourcePage)
          : renderer.render(message.tile, sourcePage);
        context.putImageData(new ImageData(pixels, region.width, region.height), 0, 0);
        compatibilityRendered = true;
      } finally {
        if (snapshot) snapshot.close();
        else if (message.tile.cache === false) renderer.release(page);
      }
    }
    extendPdfTileEdges(
      canvas,
      context,
      region,
      Math.ceil((projection?.blank?.width ?? sourcePage!.width) * scale),
      Math.ceil((projection?.blank?.height ?? sourcePage!.height) * scale),
    );
    const bitmap = canvas.transferToImageBitmap();
    scope.postMessage(
      {
        id: message.id,
        bitmap,
        ...(text ? { text } : {}),
        ...(compatibilityRendered ? { compatibility: true } : {}),
      },
      [bitmap],
    );
  } catch (cause) {
    scope.postMessage({
      id: message.id,
      error: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof PdfError ? { code: cause.code } : {}),
    });
  } finally {
    if (message.tile.cache === false) {
      hosts.get(message.tile.page)?.close();
      hosts.delete(message.tile.page);
      interpreter?.releasePage(message.tile.page);
    }
  }
}
