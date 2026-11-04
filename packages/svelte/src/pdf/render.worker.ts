import {
  openPdfDocument,
  PdfError,
  PdfInterpreter,
  paintPdfPage,
  browserPdfPaintHost,
  pdfTextContent,
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
    const scene = interpreter.page(page);
    let host = hosts.get(page);
    if (!host) {
      host = browserPdfPaintHost();
      hosts.set(page, host);
    }
    const canvas = new OffscreenCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    await paintPdfPage(context, scene, interpreter.document.source, host, { scale, region });
    extendPdfTileEdges(
      canvas,
      context,
      region,
      Math.ceil(scene.width * scale),
      Math.ceil(scene.height * scale),
    );
    const bitmap = canvas.transferToImageBitmap();
    scope.postMessage(
      { id: message.id, bitmap, ...(message.tile.text ? { text: pdfTextContent(scene) } : {}) },
      [bitmap],
    );
  } catch (cause) {
    scope.postMessage({
      id: message.id,
      error: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof PdfError ? { code: cause.code } : {}),
    });
  }
}
