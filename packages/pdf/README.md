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
lay out PDF text. Its optional `region: {x, y, width, height}` paints an integer device-pixel
rectangle at the supplied scale, including translated clips, images and shadings. This allows
bounded tile rendering without lowering resolution. `browserPdfPaintHost` caches decoded images
and glyph paths until `close()`; retain it across paints of the same visible page.

`PdfSource.renderInput()` returns an owned byte copy and the successful authentication password,
when present, so a dedicated local renderer can reopen an encrypted source. Transfer it directly
to that worker; it contains credentials and must not be logged, persisted or sent to a server.
`PdfInterpreter.executionLimits` returns the budget to use in an isolated interpreter.

This is an initial ISO 32000-1 implementation, not complete PDF conformance. Unsupported content
raises `PdfError` instead of silently omitting marks. Current gaps include Type 1 font programs,
predefined CJK CMaps, tiling patterns, transparency groups/soft masks, text clipping, mesh
shadings, PostScript calculator functions, filtered inline images and JPX/JBIG2/CCITT codecs.
ICCBased spaces currently use their standard alternate space, not a colour-managed ICC engine.
An unchanged download is always the original source, including unsupported content.

## Text selection and copying

`pdfTextContent(scene)` projects each glyph's extraction Unicode onto the same source matrices
used to paint it. It returns positioned items, source identities, font metrics and concatenated
text. `/ToUnicode` determines copied characters independently of visible glyph selection, so
ligatures and embedded OCR text remain available without altering page rendering.

`PdfDocumentView` overlays those items with a transparent, selectable `PdfTextLayer`. Drag to
select, double-click to select a word, then use browser Copy or the platform copy shortcut.
The copy handler writes plain text locally and excludes page controls and layout whitespace.
`PdfTextSelectionIndex` resolves viewport points to the nearest line and glyph boundary, including
interline gaps. Drag endpoints use this source geometry before paint while the browser supplies
highlighting, copying and autoscroll. Caret offsets stay at Unicode grapheme boundaries.
Selection follows page rotation and zoom. Selected text nodes remain mounted while their
offscreen canvases are released, allowing selection across pages.

Consecutive baseline groups retain content-flow order. Ordinary LTR glyphs within each group
follow their source positions; positioning gaps and baseline changes supply spaces and newlines.
This is a geometric reading-order heuristic, not complete tagged-PDF, `/ActualText` or bidi
reconstruction. Image-only scans need OCR before they contain selectable text. Existing hidden
OCR text is selectable. Selection does not edit the source PDF.

## Rendering verification

Run `bun run compatibility:pdf <corpus> <new-report-directory>` with Python `pypdfium2`
installed. PDFium is an independent test oracle, never a production dependency. The bundled
corpus is `packages/pdf/test/fixtures`. Reports retain native/reference/difference images and
source hashes. The 1% gate measures changed non-font page pixels at 72 DPI, with a perceptual
pixel threshold of 0.1. Non-font antialiasing counts toward the error. Separate checks require
text origins and effective em sizes within 1%, and filled-path
and image counts/bounds within 0.05 pt. Font pixels are masked only for raster comparison.
A second bitmap check compares painted text shapes per glyph region, using a one-pixel
neighborhood and normalized ink colour to tolerate rasterisation differences. It permits at
most 25% unmatched ink samples, with a three-sample allowance for tiny punctuation. A blank
text render and the wrong visible glyph fail even when their scene metadata is unchanged.
Fault tests also ensure moved text and missing small objects fail independently of pixel coverage.

The 23 positive files contain 38 pages, including browser-generated embedded fonts,
tables and gradients. All pass; the largest measured pixel error is 0.3145%. This is evidence
for those fixtures, not a claim that every PDF renders within 1%. Expand the corpus before
claiming support for additional content. Two malformed files must reject.

A second, externally authored check uses PDF 32000-1:2008 itself, downloaded from
[Adobe's standards archive](https://opensource.adobe.com/dc-acrobat-sdk-docs/standards/pdfstandards/pdf/PDF32000_2008.pdf).
The interpreter compiles 749 of its 756 pages. The seven explicit failures require CCITT images,
Tahoma fallback or tiling patterns. A fixed 20-page sample at original page numbers
1, 2, 26, 51, 76, 101, 151, 201, 251, 301, 351, 401, 451, 501, 551, 601, 651, 701, 751 and 756
passes the same independent pixel, text and object gates. Its maximum non-font error is 0.8083%.
The numerical baseline is `tools/pdf-compatibility/baselines/iso-32000-1-sample.json`.
PDFium's discretionary-hyphen sentinel is normalized to its visible hyphen for the geometry check;
unpainted whitespace is excluded because PDFium removes some source spaces from its text page.
Glyph positions following those spaces remain checked.

Append `--browser` to the comparison command to exercise the production browser painter in Chromium.
Install the matching Playwright Chromium before running that mode.

The oracle uses PDFium's matrix render API at exactly one pixel per point. Filled rectangles and
axis-aligned images retain device-pixel coverage without changing their source-space geometry.

## CMap recovery

CMap metadata dictionaries are skipped without executing PostScript. This tolerates
producer output that mixes `<< >>` with per-entry `def` commands while leaving PDF
object parsing strict. Unpaired UTF-16 surrogates in ToUnicode destinations decode
to U+FFFD, so unused broken mappings do not block page rendering. Odd-length Unicode
destinations, invalid mapping ranges and unbalanced dictionary delimiters still reject.

## Execution policy

`PdfInterpreter` shares a per-page work budget across nested Forms and Type 3 procedures.
Defaults allow 200,000 content tokens/glyphs, 50,000 scene elements and 128 execution levels;
exceeding these raises `PdfError` with code `resource_limit`. Hosts can configure these
execution limits through the interpreter's second argument. They are processing policy, not
PDF-format authoring constraints. Run untrusted parsing and interpretation in an isolated,
cancellable worker as well; a work counter cannot interrupt an individual font or filter codec.
JPEGs with non-default `/Decode`, masks or decoder parameters currently reject explicitly;
the RGB host image decoder cannot apply PDF sample transformations correctly.

## Moving text boxes

`PdfTextModel.move(id, dx, dy)` translates a recovered text region in viewport points.
When detaching a paragraph displaced by earlier edits, pass its rendered flow anchor with
`move(id, dx, dy, flowRegion.origin)`. `place(id, {x, y, width})` sets its position or wrapping width, `duplicate(id, newId)` copies
its text and formatting, and `hide(id)` hides it. Use `duplicate(id, newId, flowRegion.origin)`
to copy a displaced paragraph from its displayed location. Placement stays separate from immutable import
seeds and collaborative text, so concurrent text changes and movement can merge independently.
Moved boxes stay positioned instead of pushing neighbouring paragraphs. Placement and copied text
support selective undo without removing a peer's contribution to a newly created region.

Pure movement keeps the original showing operators, fonts, glyph transforms and spacing on export.
Viewport offsets account for page rotation, crop and content matrices. Form instances are cloned
independently. Resizing or editing uses paragraph layout instead. Geometric recovery separates
large gutters and recovers interleaved columns; showing operators remain indivisible. Scanned
or outlined content is not converted to text, hidden OCR stays hidden, annotation appearances remain
part of their annotations, source clipping still
applies, and encryption-aware export is not implemented. Movement stays on the source page.

`PdfEditableDocument` shows a movable selection border. Shift-click selects more regions, arrows
nudge by one point, and Shift uses ten points. Alt disables snapping; Escape cancels a drag.
The right handle resizes wrapping width. Drag previews move cached ink and selection layers at
animation-frame cadence and commit one collaborative position change on release. Page painters
retain decoded images while visible and share document layout with the editor.

## Collaborative text editing

`PdfTextModel` stores recovered paragraphs and explicitly placed text regions in a Yjs document.
Initialize it once on the authoritative host with `importPdfText(document)`, persist the encoded
Yjs state, and send that state to peers. Independently importing the same PDF on each peer would
create different CRDT identities. Human input and headless callers use the same `replace`, `format`,
`add`, relative anchors and selective undo operations. Imported seeds retain per-occurrence spacing;
the model reserves the `pdf-source` text attribute so those positions survive edits and collaborative
undo. Hosts must retain this metadata when persisting or validating CRDT updates. Newly placed text
on a continuation uses the optional `continuation` anchor; the Svelte editor supplies it automatically.

Hosts supply full editing fonts to `PdfEditingFonts`. Use `fonts.fork(document)` for a
document-scoped registry, or `fonts.importDocument(document)` before headless layout. The registry
retains embedded source glyphs, PDF widths and encoding mappings. A full matching family extends
subset programs for new characters; fallback is limited to glyphs absent from available source
and matching faces. `fonts.shape` supplies the same outlines and advances to the UI and writer. `layoutPdfTextFlow` supplies the browser and
exporter with the same glyph positions, wrapping, paragraph displacement and continuation pages.
`PdfEditableDocument` in `@tumblerjs/svelte/pdf` handles selection, native textarea input, composition,
formatting, page virtualization, remote selections and carets. Hosts supply authenticated presence
and update transport rather than coupling the engine to accounts or servers.

`exportEditedPdf(document, model, fonts)` appends an ISO 32000-1 §7.5.6 revision. It preserves untouched
source objects and graphics. Replaced text-showing operations become equivalent TJ displacements,
including numeric kerning and quote-operator side effects. Modified Form instances are cloned.
Existing source glyphs reuse their original font resources, including subset and CFF programs.
New text uses embedded TrueType/CID fonts and ToUnicode mappings, and long continuations create real
PDF pages. An unchanged export returns the original bytes. Historical revisions remain recoverable;
this API does not implement secure redaction.

Paragraph recovery and columns use geometry. New characters absent from a subset need a full matching face or fallback, and
complex columns, rotated text, bidi shaping and tagged structure updates need further qualification.
Encrypted editing is not implemented. Missing editing glyphs fail explicitly. None of these boundaries
is a document-authoring size limit.

## Page operations

`PdfTextModel.pages` stores page order, visibility and quarter-turn rotations in the same
collaborative document and undo history as text. Original text ownership always uses the original
source page index. Inserted blank pages have immutable identities and unique negative source indices.

```ts
const blank = model.pages.insert(document.pages, document.pages[0].id);
model.pages.rotate(document.pages, [blank], 90);
model.pages.move(document.pages, blank, document.pages[0].id);
model.pages.remove(document.pages, [blank]);
const edited = exportEditedPdf(document, model, fonts);
const selected = extractPdfPages(openPdfDocument(edited), [0, 2]);
```

`model.pages.initialize(document.pages)` prepares shared page ownership before reactive rendering.
It is idempotent and does not mark the PDF edited. Read methods and layout never mutate the document;
page mutation methods initialize ownership themselves.

`layoutPdfTextFlow` returns the current output pages, with stable `id`, original `source`,
`continuation` number and relative `rotation`. Pass its `pages` as the optional last argument to
`insert`, `move`, `remove` and `rotate` when manipulating individual continuation pages. Removing
every output page creates an editable blank replacement. Concurrent deletions that remove each
peer's last remaining page converge on one blank recovery page. Placing text on that recovery
page makes it persist when another peer undoes a deletion. Undoing insertion hides a blank while
retaining its immutable text ownership. The operation methods own their transactions; call
`model.undo.stopCapturing()` around a user gesture instead of wrapping them in another transaction.
`PdfEditableDocument` renders this order and rotation, including text placement and box manipulation.

Page-only exports copy object references without interpreting page content or loading fonts.
Removing source pages reconstructs the remaining document's bookmarks, form fields and tagged
structure. `extractPdfPages` writes a fresh document in the selected output-index order. It copies
encoded streams and shared resources without rasterising them or retaining original revisions.
Selected AcroForm widgets retain their field ancestors, values and appearances. Bookmarks and
internal links retain selected destinations. Tags and their reverse parent maps retain selected
page and annotation content. An extracted signature field has its original signature value cleared,
because the new document is not the signed byte sequence. XFA extraction reports an explicit
unsupported-feature error, since its XML form data needs a separate reconstruction path.

The workspace or host may still retain original bytes for undo and recovery. These operations are
not a secure-redaction API. Existing text edits do not reconstruct tagged reading-order semantics.

### Find text

`new PdfSearchIndex(document).find('invoice number')` searches the whole document
using case-insensitive literal matching. Pass `{ matchCase: true, pages: [2, 3] }`
to limit the search (page numbers are one-based). Results contain `matches` and
`total`; each match has `page`, `text`, `context`, and `rects` in viewport points
with a top-left origin. Wrapped phrases can have several rectangles. Ligature
expansion retains the original glyph geometry. Invisible OCR text is included;
image-only pages have no searchable text.

For current edits, construct the snapshot with `{ model, fonts }` as the second
argument. Rebuild it after edits or page operations; deleted text and replaced
source glyphs are excluded. Search does not modify the model or undo history.
The PDF viewer opens search with Cmd/Ctrl+F. Enter and Shift+Enter navigate,
Escape closes, and Aa toggles case sensitivity.

## Merge PDFs

```ts
import { openPdfDocument, mergePdfDocuments, parsePdfPageSelection } from '@tumblerjs/pdf';

const first = openPdfDocument(firstBytes);
const second = openPdfDocument(secondBytes, { password: 'optional-password' });
const output = mergePdfDocuments([
  { document: first, pages: parsePdfPageSelection('3,1-2', first.pages.length) },
  { document: second }, // All pages, in source order.
  { document: first, pages: [0, 0] }, // Zero-based API indices; repetitions are allowed.
]);
```

The output is a new, unencrypted PDF. Inputs are never changed. Pages retain their
encoded content streams, embedded fonts and images, graphics, page boxes,
rotation, annotations and appearance streams. Internal links and bookmarks are
retained when their target belongs to the same input selection; links to omitted
pages are removed. Repeated pages start an independent selection and receive
independent annotations and fields. To interleave PDFs, repeat an input in the
array at the desired position. Selection strings use one-based inclusive ranges,
including descending ranges and repeated pages.

Interactive fields are grouped under `source1`, `source2`, etc., preventing field
and font-resource name collisions. Repeated-page copies receive their own group.
Tagged structures, reverse parent maps, IDs and custom role/class names are kept
disjoint; bookmarks and optional-content groups are combined. Document-level
metadata, attachments that are not page annotations, page labels and document
scripts are not combined. XFA, signature fields, scripted forms, forms with ResetForm,
SubmitForm, Hide or ImportData actions, and indeterminate
or non-default optional-content configuration intents are rejected explicitly.
A merge does not retain or validate digital signatures.

The CLI and the Svelte `PdfMerge` component use these same APIs and selection rules.
Run `bun test packages/pdf/test/merge.test.ts` for structural coverage, and
`python3 tools/pdf-merge/verify.py` for the independently generated document corpus
and Poppler/pypdf content-preservation checks.
