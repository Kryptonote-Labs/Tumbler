# Tumbler PDF

`@tumblerjs/pdf` owns source-preserving PDF objects and page interpretation independently of
a host UI. Original bytes and revisions remain available for unchanged export and future edits.

```ts
import { openPdfDocument } from '@tumblerjs/pdf';
const document = openPdfDocument(bytes);
console.log(document.pages.map(page => ({ id: page.id, width: page.width, height: page.height })));
const unchanged = document.bytes();
```

The source reader follows ISO 32000-1 object syntax, classic and stream cross-references,
incremental revisions, compressed object streams, content filters and page-tree inheritance.
It does not replace malformed cross-reference data with a heuristic repair scan.

Standard security handlers authenticate before content decoding. Legacy RC4, AES-128 and
AES-256 revisions retain their original encrypted source bytes. Supply `{ password }` to open
a protected document; password-required and invalid-password errors are distinct.

`PdfInterpreter.page(index)` compiles positioned glyphs, paths, images, Form XObjects and
annotation appearances into a source-aware scene. Glyphs retain character codes, CIDs, Unicode,
source ranges, font metrics and explicit transforms. Embedded TrueType/OpenType/CFF outlines are
painted directly. Standard unembedded fonts use individual host glyphs with PDF advances.
`paintPdfPage` accepts a canvas and replaceable image/path host; it never asks the browser to
lay out PDF text. `browserPdfPaintHost` supplies browser paths, images and temporary surfaces.

This is an initial ISO 32000-1 implementation, not complete PDF conformance. Unsupported content
raises `PdfError` instead of silently omitting marks. Current gaps include Type 1 font programs,
predefined CJK CMaps, tiling patterns, transparency groups/soft masks, text clipping, mesh
shadings, PostScript calculator functions, filtered inline images and JPX/JBIG2/CCITT codecs.
ICCBased spaces currently use their standard alternate space, not a colour-managed ICC engine.
An unchanged download is always the original source, including unsupported content.

## Rendering verification

Run `bun run compatibility:pdf <corpus> <new-report-directory>` with Python `pypdfium2`
installed. PDFium is an independent test oracle, never a production dependency. The bundled
corpus is `packages/pdf/test/fixtures`. Reports retain native/reference/difference images and
source hashes. The 1% gate measures changed non-font page pixels at 72 DPI, with antialiasing
excluded. Separate checks require text origins and effective em sizes within 1%, and filled-path
and image counts/bounds within 0.05 pt. Font pixels are masked only for raster comparison.
Fault tests ensure moved text and missing small objects fail independently of pixel coverage.

The initial 22 positive files contain 37 pages, including browser-generated embedded fonts,
tables and gradients. All pass; the largest measured pixel error is 0.3901%. This is evidence
for those fixtures, not a claim that every PDF renders within 1%. Expand the corpus before
claiming support for additional content. Two malformed files must reject.
