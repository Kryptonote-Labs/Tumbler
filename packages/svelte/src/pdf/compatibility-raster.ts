import { PDFiumModule } from '@hyzyla/pdfium';
import type { PdfTileRequest } from './render-protocol.ts';

type Engine = Awaited<ReturnType<typeof PDFiumModule>>;
const rgbaBitmap = 4;
const renderAnnotations = 1;
const reverseByteOrder = 16;

/** Rendering-only PDFium document. Source authority and edit operations stay with Tumbler. */
export class PdfCompatibilityRaster {
  private activePage: { index: number; handle: number } | undefined;

  private constructor(
    private engine: Engine,
    private handle: number,
    private source: number,
    private ownsEngine: boolean,
  ) {}

  static async open(input: { bytes: Uint8Array; password?: string }, wasmUrl: string) {
    const engine = await PDFiumModule({ locateFile: () => wasmUrl });
    engine._FPDF_InitLibraryWithConfig({
      version: 2, m_pIsolate: null, m_pUserFontPaths: null, m_v8EmbedderSlot: 0, m_pPlatform: null,
    });
    try {
      return PdfCompatibilityRaster.load(engine, input, true);
    } catch (error) {
      engine._FPDF_DestroyLibrary();
      throw error;
    }
  }

  openSnapshot(bytes: Uint8Array) {
    return PdfCompatibilityRaster.load(this.engine, { bytes }, false);
  }

  private static load(
    engine: Engine,
    input: { bytes: Uint8Array; password?: string },
    ownsEngine: boolean,
  ) {
    const { malloc, free } = engine.wasmExports;
    const source = malloc(input.bytes.byteLength);
    const passwordBytes = new TextEncoder().encode((input.password ?? '') + '\0');
    const password = malloc(passwordBytes.byteLength);
    try {
      if (!source || !password) throw new Error('Could not allocate PDF rendering memory.');
      engine.HEAPU8.set(input.bytes, source);
      engine.HEAPU8.set(passwordBytes, password);
      const handle = engine._FPDF_LoadMemDocument(source, input.bytes.byteLength, password);
      if (!handle) throw new Error('Could not open PDF for compatibility rendering.');
      return new PdfCompatibilityRaster(engine, handle, source, ownsEngine);
    } catch (error) {
      if (source) free(source);
      throw error;
    } finally {
      if (password) free(password);
    }
  }

  render(tile: PdfTileRequest, page: { width: number; height: number }) {
    const { engine } = this;
    if (this.activePage?.index !== tile.page) {
      this.release(this.activePage?.index);
      const handle = engine._FPDF_LoadPage(this.handle, tile.page);
      if (!handle) throw new Error('Could not open PDF page for rendering.');
      this.activePage = { index: tile.page, handle };
    }
    const { x, y, width, height } = tile.region;
    const stride = width * 4;
    const buffer = engine.wasmExports.malloc(stride * height);
    if (!buffer) throw new Error('Could not allocate a PDF tile.');
    let bitmap = 0;
    try {
      bitmap = engine._FPDFBitmap_CreateEx(width, height, rgbaBitmap, buffer, stride);
      if (!bitmap) throw new Error('Could not create a PDF tile.');
      engine._FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
      engine._FPDF_RenderPageBitmap(
        bitmap, this.activePage.handle, -x, -y,
        Math.ceil(page.width * tile.scale), Math.ceil(page.height * tile.scale), 0,
        reverseByteOrder | (tile.projection?.excludeAnnotations?.length ? 0 : renderAnnotations),
      );
      return new Uint8ClampedArray(engine.HEAPU8.subarray(buffer, buffer + stride * height));
    } finally {
      if (bitmap) engine._FPDFBitmap_Destroy(bitmap);
      engine.wasmExports.free(buffer);
    }
  }

  release(index?: number) {
    if (!this.activePage || this.activePage.index !== index) return;
    this.engine._FPDF_ClosePage(this.activePage.handle);
    this.activePage = undefined;
  }

  close() {
    this.release(this.activePage?.index);
    this.engine._FPDF_CloseDocument(this.handle);
    this.engine.wasmExports.free(this.source);
    if (this.ownsEngine) this.engine._FPDF_DestroyLibrary();
  }
}
