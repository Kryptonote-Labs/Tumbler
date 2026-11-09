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
const hosts = new Map<number, ReturnType<typeof browserPdfPaintHost>>();
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "open") {
    try {
      openError = undefined;
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
    let scene = projection?.blank ? undefined : source.page(projection?.snapshot ? 0 : page);
    if (scene && projection) {
      const placed = placePdfSceneSources(scene, projection.placements);
      const excluded = new Set(projection.exclude);
      const included = projection.include && new Set(projection.include);
      scene = {
        ...placed,
        elements: placed.elements.filter(
          (element) =>
            !excluded.has(pdfSourceKey(element.source)) &&
            (!included || included.has(pdfSourceKey(element.source))),
        ),
      };
    }
    let host = hosts.get(page);
    if (!host) {
      host = browserPdfPaintHost();
      hosts.set(page, host);
    }
    const canvas = new OffscreenCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    if (scene)
      await paintPdfPage(context, scene, source.document.source, host, {
        scale,
        region,
        background: projection?.transparent ? "transparent" : "#fff",
      });
    else if (!projection?.transparent) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, region.width, region.height);
    }
    extendPdfTileEdges(
      canvas,
      context,
      region,
      Math.ceil((scene?.width ?? projection!.blank!.width) * scale),
      Math.ceil((scene?.height ?? projection!.blank!.height) * scale),
    );
    const bitmap = canvas.transferToImageBitmap();
    scope.postMessage(
      {
        id: message.id,
        bitmap,
        ...(message.tile.text && scene ? { text: pdfTextContent(scene) } : {}),
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
