# `@tumblerjs/word`

Headless WordprocessingML reading, preservation, page layout, and editing for
browser-owned document experiences.

> **Extremely early alpha.** This is a bounded WordprocessingML slice, not a
> replacement for Microsoft Word. APIs and layout behavior can change without
> notice. Keep original copies of important files.

```sh
bun add @tumblerjs/word
```

Create a blank or formatted document without a template:

```ts
import { createWordArtifact } from "@tumblerjs/word";

const artifact = createWordArtifact({
  defaultFormat: { fontFamily: "Arial", fontSizePoints: 13 },
  paragraphs: [{
    alignment: "center",
    runs: [{ text: "Project brief", format: { bold: true } }],
  }],
  author: "Alex",
});
const bytes = artifact.bytes();
```

Creation defaults to A4 with one-inch margins and modern Word compatibility.

Line layout lets ordinary trailing spaces extend past the margin without moving
a fitting word or adding space-only lines. Their logical offsets are retained
even though they have no painted width. The document compatibility setting
`w:compat/w:wrapTrailSpaces` enables normal wrapping of spaces when true; absent
or false uses the default hanging behavior. Package and native layout both honor
this setting. See [OOXML wrapTrailSpaces](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.wraptrailspaces).
Paragraphs are explicit; tabs can appear inside runs. Fonts are named, not embedded.
This API authors a new file and does not import or flatten existing documents.

Open a DOCX and inspect its semantic document:

```ts
import { openWordArtifact, wordParagraphText } from "@tumblerjs/word";

const bytes = new Uint8Array(await file.arrayBuffer());
let artifact = openWordArtifact(bytes);
const paragraph = artifact.document.blocks.find((block) => block.kind === "paragraph")!;

console.log(wordParagraphText(artifact.document, paragraph));
```

`w:sym` elements participate in text projection, layout, selection and deletion.
The original font/code pair survives unchanged-symbol export. Wingdings barb
arrows DF–E6 have Unicode display equivalents, so they do not require Wingdings;
the host still needs a font covering those Unicode characters. Other symbols use
their specified font and code. This is not a complete Wingdings/Webdings mapping.

Text positions are UTF-16 offsets in a paragraph's visible logical stream. They
do not expose producer-specific run splitting:

```ts
artifact = artifact.replaceText({
  anchor: { paragraphElementId: paragraph.elementId, offset: 0 },
  focus: { paragraphElementId: paragraph.elementId, offset: 5 },
}, "Hello");
```

Simple paragraph splits and joins use `\n`. Tumbler refuses structural edits
through fields, links, revisions, bookmarks, drawings, mixed direct formatting,
or different table/story containers rather than risking invalid OOXML.

Text runs support solid background shading separately from highlighting, including theme fills, inheritance, and explicit clearing. Highlighting takes precedence when both are present. Patterned shading is retained in source XML; its pattern is not painted.

Apply the same format-neutral patches used by the other Tumbler formats:

```ts
artifact = artifact.applyFormatting({
  anchor: { paragraphElementId: paragraph.elementId, offset: 0 },
  focus: { paragraphElementId: paragraph.elementId, offset: 5 },
}, {
  text: {
    fontFamily: { set: "Aptos" },
    fontSize: { set: 14 },
    bold: { set: true },
    color: { set: { type: "rgb", value: "#17365D" } },
  },
  block: { horizontalAlignment: { set: "center" } },
});
```

For bounded undo, redo, dirty state, save points, and external agent revisions:

```ts
import { openWordEditingSession } from "@tumblerjs/word";

const session = openWordEditingSession(bytes, { limit: 100 });
session.replaceText(selection, "Updated");
session.undo();
session.redo();
session.markSaved();

const output = session.artifact.bytes();
```

Session subscribers receive immutable change snapshots in revision order. Reentrant
edits, undo, redo, saves, and external revisions commit immediately, but their
notifications wait until the current event reaches all its subscribers. Read
`change.artifact` and `change.dirty` for that revision; the live session may already
contain a later revision. Subscribing or unsubscribing affects events committed
after that subscription change, not events already queued.

Subscriber exceptions do not reject committed operations or stop other subscribers.
Pass `onListenerError(error, change)` in session options to report them. By default,
the session calls `console.error`. If a custom reporter throws, the session logs
both errors and continues delivery. A throwing console is ignored. Reporters run
synchronously and may also cause queued notifications. Callbacks must eventually
stop making edits so the synchronous notification queue can finish draining.

Word 2010 ink uses `@tumblerjs/ink` to expose decoded traces, recognition and
diagnostics on `drawing.ink`. Native InkML is authoritative: the reader generates
SVG for destination-independent pens, even when a cached VML bitmap exists.
`inkRendering` is `vector`, `raster` (needs page pixels), or `bitmap` (native
interpretation unavailable). `inkSource` identifies the stored InkML part;
`inkProjection` supplies the affine transform and painted bounds. Generated
previews have no stored image `partName` or `relationshipId`.

`paintWordPage` renders native ink against the page backdrop when its context
provides `getImageData` and `putImageData`. This implements all sixteen Office
raster operations, with floating drawings painted behind/in front of text in
z-order. Image-only consumers use the cached preview for destination-dependent
pens; without one their preview is empty and diagnostics explain the requirement.
Strict and Transitional host namespaces are supported. External relationships
are never fetched.

Moving/resizing updates DrawingML and VML together while retaining the InkML and
media bytes. `WordArtifact.replaceInkTrace` and `WordEditingSession.replaceInkTrace`
replace samples and regenerate an existing PNG fallback in one package revision.
Shared parts are copied; exclusive parts are reused. Affected recognition caches
and embedded VML ink caches are invalidated. Undo/redo restores the whole package.
Samples use their declared channel order/device coordinates; the existing native
frame stays fixed. Resize the drawing separately to change its placement.

```ts
const drawing = [...session.artifact.document.drawings.values()].find(d => d.ink);
const trace = drawing?.ink?.traces[0];
if (drawing && trace) {
  session.replaceInkTrace({
    elementId: drawing.elementId,
    traceElementId: trace.elementId,
    points: replacementSamples,
  });
}
```

Configure physical device defaults, relative brush units and the synchronous
point budget through `inkRendering`; pixel consumers expose `maxPixels` (or
`paintWordPage`'s `inkMaxPixels`). These are configurable work budgets, not document
limits. Destination-dependent fallback generation requires explicit backdrop
pixels or a background colour through `preview`. See [ink conformance](../../docs/ink-conformance.md)
for validation evidence and remaining Word interoperability work.

The current reader/layout slice includes Strict and Transitional main parts,
styles and themes, numbering, sections and columns, tables and nested tables,
headers and footers, footnotes and endnotes, hyperlinks and bookmarks, embedded
images, and the shared native chart subset. Stored field results render, but
Tumbler does not recalculate general Word fields.

Paragraph-mark formatting determines empty-line metrics. Automatic line spacing
scales the measured font line box; exact and at-least spacing use the authored
point height. Browser measurers should include the font's line gap and avoid
rounding vertical metrics at each text size, since small errors accumulate across pages.

Body pagination keeps `keepNext` chains together independently of `keepLines`.
Chains taller than a column start fresh once, then flow normally. Widow control is
on by default and keeps the first and last pairs together when a column can hold
them. Explicit page and column breaks take precedence. `nextColumn` sections reuse
an available column when page and column geometry match.

Body, table cells, and auxiliary stories share adjacent paragraph spacing. The gap
uses the maximum of the previous after-spacing and current before-spacing.
For matching computed paragraph styles, each `contextualSpacing` contribution is
subtracted from that maximum, down to zero. These gaps also determine pagination
and table heights; prepared source formats remain unchanged.

See the repository's
[WordprocessingML implementation status](../../docs/wordprocessingml-implementation.md)
for the exact capability matrix and known limitations.

MIT licensed. See [LICENSE](LICENSE).

### Structured authoring

`createWordArtifact({ blocks })` accepts paragraph, table and image blocks. A paragraph has
formatted `runs`, optional alignment and optional `list: { id, kind, level, start }` metadata.
Reuse a list ID to continue numbering; use a new ID to restart it. Levels range from zero to eight.
Imported `source-list-N` identities bind to the package's existing numbering instance.
Reusing one in appended or moved paragraphs continues that instance in native preview
and export, including its level patterns and start overrides. Use a new identity to
start an independently defined list. Imported identities must retain their source
level definitions. Incompatible kind/start/marker metadata or an undefined source
level throws `TypeError` in preview and export instead of silently dropping the edit.
Compatible imported definitions, including empty bullet markers, remain valid when
appending items. Newly authored bullet markers must still be nonempty.

Imported numbering resolves paragraph-style `numPr` through `basedOn`, including the
default paragraph style. Level `pStyle` selects the inherited level; direct `ilvl`
overrides it, and `numId=0` cancels numbering. Numbering-style `numStyleLink` references
resolve before instance overrides; numbering styles ignore `basedOn`. Native style
edits and new styled paragraphs resolve numbering against their current style while
retaining direct numbering and cancellation. Native updates also include the missing
built-in styles that export will add; opening an untouched source keeps its imported styles. Missing links have no marker; cycles throw
`invalid_document`, and style/link chains over 100 entries throw `limit_exceeded`.
`lvlRestart=0` never restarts. Other valid triggers restart at that level or an earlier
level, with the preceding level as the default. An omitted imported `start` is zero;
newly authored lists still explicitly start at one. Package, native, and edit/export
paths share these definitions and preserve existing numbering-part bytes.

Numbering resolution counts derived marker text and suffixes in UTF-16 units.
`numbering.markers(document, { maxCharacters })` and
`numbering.markersFor(references, { maxCharacters })` default to a cumulative
1,000,000-character budget per call. They throw `WordError` with code
`limit_exceeded` before expanding text beyond the budget. Raise the budget explicitly
for trusted documents that need larger output. `NativeWordOptions.maxMarkerCharacters`
sets the cumulative update budget for both authored and imported markers.
`WordLayoutOptions.maxMarkerCharacters` sets the body-and-story layout budget;
native layout defaults to its constructor setting. Cached markers still count when
a later request lowers the budget. Replaced headers and footers contribute only
their current marker text; discarded original markers are not resolved or charged.
This is a processing budget, separate
from `openWordDocument`'s input-text limit; it does not restrict authored start values.
Roman formatting checks the expanded length before allocating repeated symbols.
Values above 3,999 retain the existing repeated-`M` representation when the budget
permits them. No decimal fallback or claimed Word numeral-domain cutoff is applied.

Tables have rectangular `rows` of cells, each containing `blocks`, and optional column widths in
points. Image blocks contain PNG or JPEG bytes, dimensions in points and optional alt text.
Images are embedded in the DOCX, with relationships created automatically. `blocks` and the
older `paragraphs` option are mutually exclusive.

The authoring API does not impose fixed block, cell, nesting, or image-data caps.
Inputs must satisfy format and structural validation. Parsing protections and caller-selected
layout work budgets are separate from document authoring capabilities.
The structured input is an authoring format, not a lossless conversion of arbitrary existing DOCX files.

Images can also appear inside a paragraph or table cell alongside text. An image run uses
`{ text: '\uFFFC', image: { bytes, contentType, width, height, alt } }`. Its logical text length is
one, matching the drawing offsets returned by Word layout and text APIs.

Authored images also accept `layout: 'inline' | 'front' | 'behind'`, horizontal
`alignment: 'left' | 'center' | 'right'`, and optional `x`/`y` offsets in points.
Floating images do not reserve text space. `x` overrides alignment within the
containing column; `y` is relative to the paragraph when `moveWithText` is true
(the default), or to the page when false. Horizontal alignment and `x` remain relative to the
column in both modes, including inside table cells. These settings serialize to native
Word drawing anchors and use the same geometry in headless layout. Inline image
alignment is controlled by the containing paragraph.

### Painting pages

`paintWordPage(context, page, options)` paints a laid-out page onto any Canvas 2D
context: browser, `OffscreenCanvas`, or a server canvas such as `@napi-rs/canvas`.
It draws the layout's geometry directly, so thumbnails and previews match the
editor without a DOM. Text, list markers, highlights, underline, strikethrough,
paragraph and table shading and borders, images, shapes and charts are painted.
Images paint only when `options.image` returns a decoded source for the drawing;
`wordPageImages(page)` lists them so hosts with asynchronous decoding can prepare
them first. Shapes and charts are vector paths, so they paint when `options.path`
builds the host's `Path2D`; they draw the same geometry as the Svelte editor
(`wordShapePath` and `@tumblerjs/charts` scenes). Shape text is laid out by
`layoutWordShapeText` with the document engine, so rich runs, paragraph
formatting and text anchoring paint as they edit. Pass the page's measurer as
`options.measurer` so shape text measures like the page.

```ts
const measurer = canvasWordTextMeasurer(context);
const [page] = layoutWordDocument(document, measurer, { pageLimit: 1 }).pages;
paintWordPage(context, page!, { scale: 480 / page!.width, path: d => new Path2D(d) });
```

`pageLimit` stops layout after that many complete pages and marks the result
`truncated`; unlike `maxPages`, a longer document is not an error.

`canvasWordTextMeasurer` measures with the same context API and memoises each
distinct run, so create a new measurer when fonts change. Without line metrics it
uses the font bounding box, which omits external leading. In a browser,
`browserWordTextMeasurer` from `@tumblerjs/svelte` adds the CSS line box.

### Pointer hit testing

`wordLineAtPoint(page, x, y)` selects a body text line from a `WordLayoutPage`.
Coordinates are relative to the page origin in points, before zoom. Convert browser
CSS pixels by removing the page offset and zoom, then dividing by `wordPointsToCssPixels(1)`.

Clicks inside a table cell stay within its content, including padding and merged
cells. Nested cells take priority. Outside cells, the helper chooses the nearest
line vertically, then horizontally. Pages without body text return `undefined`;
headers, footers and notes are excluded. Renderers resolve the character offset
within the returned line using their text geometry.

### Vertical caret navigation

`wordAdjacentLine(layout, current, direction, x)` chooses one visual line above or
below a caret. `current` identifies the page, paragraph and line start offset;
`x` is a page-relative coordinate in points. The result contains the destination
page, line and horizontal coordinate. Body text continues across columns and
pages, and table movement follows the current cell before the next row. Pass
`story: 'header'` or `story: 'footer'` in `current` to stay within that page's story.
At the beginning or end of the flow the result is `undefined`. Renderers retain
the preferred horizontal coordinate across short lines, mount the destination,
and resolve its character offset using their text geometry.

### Native documents

`NativeWordDocument` reconciles rich authored blocks in memory and uses the same pagination
engine as package-backed Word documents. Updates and layout do not rebuild XML or ZIP files.

```ts
import { NativeWordDocument } from '@tumblerjs/word';

const document = new NativeWordDocument({
  defaultFormat: { fontFamily: 'Arial', fontSizePoints: 13 },
});
document.update([
  { kind: 'paragraph', id: 'intro', runs: [{ text: 'Hello', format: { bold: true } }] },
]);
const layout = document.layout(measurer); // WordTextMeasurer, with measurements in points
const bytes = document.artifact().bytes(); // Package only at the export boundary
```

`update` takes the complete current `WordContentBlock` tree, including lists, tables, and
images. Validation failure leaves the published content unchanged. Stable paragraph and table
IDs preserve identity across insertions; IDs must be unique throughout the tree and are ignored
by DOCX serialization. Without IDs, reconciliation uses structural paths. Treat blocks, options,
and image bytes as immutable after supplying them; replace changed values before updating.

Unchanged paragraphs reuse measurements, and unchanged positioned lines and pages retain object
identity. Keep the same measurer while font metrics remain valid; replace it when metrics change.
`cache.measuredParagraphs` counts measured paragraphs. Reconciliation and pagination still walk
content, so this is not a constant-time or viewport-only layout API.

`paragraphs()` returns current UTF-16 text ranges, separated by one code unit, including table
cells. Images occupy U+FFFC. The application owns rendering, input, selection mapping, history,
persistence, and collaboration. `WordDocumentView` currently expects a package-backed document.
Pass `source: openWordArtifact(bytes)` to import an existing DOCX into this same engine.
Source styles, sections, hyperlinks, numbering, table properties, drawings and stories are compiled
once. Editing uses semantic nodes and cached geometry; retained XML and package parts are consulted
only at import and export. `WordPackageDocument` is a compatibility name for this native engine.

### Editing headers and footers

`wordStoryArtifact(source, partName)` exposes a header or footer through the same content and
formatting operations as the main document. Source element identifiers are local to that part.
Its bytes still contain the complete DOCX package; reopen them normally to return to the body.

```ts
const model = new NativeWordDocument({ source });
model.updateStory('/word/header1.xml', [
  { kind: 'paragraph', alignment: 'center', runs: [{ text: 'Revised header' }] },
]);
model.updateStory({ section: 0, kind: 'footer', type: 'default' }, [
  { kind: 'paragraph', runs: [{ text: 'New footer' }] },
]);
const layout = model.layout(measurer);
const edited = model.artifact();
```

Pass a part name to edit an existing shared story. All sections referencing or inheriting it
see the edit. Pass a zero-based section and `default`, `first` or `even` variant to create or
update that section's reference. `createWordStory` also creates a package-backed empty story
and returns its part name. `removeStory` discards a native model override and restores the source
behavior; it does not delete source parts.

Page `headerStory` and `footerStory` metadata identify the effective section, variant and
relationship, including empty regions. Layout follows first-page and even-page settings and
reserves body space for story content. If repeated stories consume the whole page,
`storyOverflow` reports the collision and the body falls back to its section margins rather than
being placed outside the page. Story content is retained without an authoring limit. `updateStory` returns the child model for region-local
paragraph positions. Collaborative commands accept any named top-level `Y.Text`, so hosts can
use separate text streams and undo histories for the body and each shared story.

### Plain-text transactions

`NativeWordText.transact([{ start, deleteCount, insert }])` applies sequential UTF-16 edits
atomically and preserves unchanged paragraph identities. `revision` advances once per nonempty
transaction. `NativeWordTextLayout` caches continuous paragraph line geometry, without rich page
pagination. `docx(options)` packages the current plain text when exporting.

The docs site’s **Native Word model** guide includes API examples, cache invalidation, text
positions, and integration boundaries (`apps/docs/src/lib/native-word-docs.ts`).


## Table geometry and cell merging

`NativeWordDocument.geometryAt(offset, tableDepth = 0)` reports page, margin and column
widths in points for the section containing that text offset. For tables it also reports
`columnWidthsPoints`, `widthPoints`, `widthCm`, `availableWidthPoints` and
`fitsAvailableWidth`. Increase `tableDepth` to inspect a nested table against its parent
cell's content width. These are authored horizontal dimensions, not text wrapping or
pagination measurements. Table `columnWidths` values are points, 72 per inch; fields
whose names end in `Twips` use twentieths of a point.

The collaborative `table-edit` actions `merge-right` and `split-cell` operate on horizontal
cell spans. Merging preserves both cells' paragraphs under the first cell identity.
Splitting keeps existing content in the first cell and adds empty cells for the remaining
columns. Both reject cells participating in vertical merges and support undo.

## Shared editable content from DOCX

`importWordContent(artifact)` projects paragraphs, runs and nested tables into editable content.
Source references retain Word properties and wrappers that an editing interface does not expose.
Keep the original artifact immutable alongside the shared content. Character identities, presence,
permissions and synchronization belong to the host application.

`NativeWordDocument` renders and exports the shared content, retaining the original package for export:

```ts
const source = openWordArtifact(bytes);
const model = new NativeWordDocument({ source });
const content = importWordContent(source);
// Store content in the host's collaborative model, then apply its current content:
model.update(content);
const layout = model.layout(measurer);
const docx = model.artifact().bytes();
```

`reconcileWordContent(original, content)` provides the same materialization without retaining a
model instance. Both APIs preserve untouched package parts, section properties, styles and opaque
XML. Source identifiers refer to the original package, never to a later exported revision.
Table content includes cell spans, vertical merges, column widths and source row/cell identities.
Created and imported documents share reconciliation, measurement caching and pagination.
Unchanged table grids, prepared cells and matching page slices reuse geometry. Width, font measurer,
cell content and list-marker changes invalidate the relevant cache. Page slices are retained for the
current and preceding layout; cached placements still count towards fragment limits. Native updates
continue to visit semantic children so list numbering, source continuations and identity checks stay
current.
Keep original package bytes outside frequently rewritten collaboration snapshots.
`createWordSourceManifest(source)` supplies immutable reference IDs for validating remote updates
without reparsing source XML. It also includes resolved default text formatting for headless consumers.
Hosts must validate this manifest at import and prevent clients replacing it.

For independent copies of source paragraphs or run fragments, give the copied content a new
`sourceCopy` identity. Reusing `source` without a copy identity means continuation, as when
splitting a paragraph. Repeated source tables and rows are detected as copies automatically.


### Collaborative operations

The optional `@tumblerjs/word/collaboration` entry point uses Yjs. Install `yjs` only when using this
adapter; the native engine and package APIs do not depend on it.

```ts
import { createWordCommands } from '@tumblerjs/word/collaboration';

const commands = createWordCommands({ defaultFontSize: 12 });
const target = commands.anchorWordRange(body, { start: 0, end: 5 });
const delta = commands.wordTransaction(body, [
  { kind: 'replace', target, expected: 'Hello', value: 'Welcome' },
]);
body.applyDelta(delta);
```

`body` is the Y.Text named `body` on an attached Y.Doc. People and agents use the same anchored
replace, format, image and table operations. Batch preflight is atomic and rejects stale expected
text. Yjs supplies synchronization and selective undo. The adapter validates text, grapheme boundaries,
formatting and table structure. Hosts provide optional `validateAttributes` and `validateUpdate` hooks
for their schema, immutable import provenance and asset references, and enforce permissions when
accepting updates. Hosts can instead use `validateDocument(staged, original)` to inspect the existing
preflight replica without decoding another copy. This synchronous hook runs after built-in validation;
it must not mutate either document and can throw to reject the edit atomically. If both document and
encoded-update hooks are supplied, both run. A `defaultAttributes(body)` callback supplies document-specific formatting defaults
for selection inspection and inserted text. The adapter does not provide authenticated networking or persistence.

`wordTextRange(text, start, end)` reads UTF-16 ranges and effective attributes without materializing
unchanged character content. It walks linked CRDT items, so heavily fragmented text can still cost
more than a contiguous run. `isWordTextOnlyEdit(event.delta, previousText)` proves that an edit on an
already validated region preserves paragraph, table, list and object structure. `previousText` must
be an untouched pre-edit replica. A false result requires full validation. Hosts still validate
inserted source references, custom attributes, immutable metadata, region identities and update
completeness. Formatting changes and edits containing paragraph terminators or object characters
always require full validation.

Replacement changes accept an optional `format` patch, for example
`{ kind: 'replace', target, value: 'Welcome', format: { bold: true, italic: null } }`.
The replacement inherits formatting as usual, then patches the resulting text in the same staged
transaction. Unspecified properties survive; null removes a property. This differs from the existing
`attributes` option, which supplies the full replacement attributes. Paragraph properties such as
`align` affect every paragraph touched by the resulting text, including its retained terminator.
CRLF input is normalized before determining the resulting range. Empty replacements cannot carry
`format`; use a format operation on an explicit paragraph range when deleting and restyling are
separate intentions.

Paragraph format patches retain the public `{ paragraph: { keepNext: true } }` shape. Each
supplied paragraph property has its own Yjs register, so concurrent patches to different properties
survive synchronization and selective undo. Structured properties such as `lineSpacing` and `borders`
remain atomic. `paragraph: {}` is a no-op; `paragraph: null` removes all supported direct paragraph
properties. Concurrent reset and patch operations resolve per property using Yjs conflict ordering.

Existing `paragraph` object attributes remain readable. New edits use internal
`wordParagraphFormat:<property>` attributes with wrapped values; wrapped null masks an old property.
`wordFormats` returns the decoded public object. Hosts reading raw deltas or paragraph slices should
call `readWordParagraphFormat(attributes)` before converting paragraph formatting to Office content.
For source-aware reconciliation, also set `resetParagraphFormat: true` on `WordTextParagraph` when
`hasWordParagraphReset(attributes)` returns true. This clears imported direct paragraph properties
before applying the surviving values, including after concurrent reset and patch operations.
Upgrade all collaborating writers together: old clients do not understand these registers, and legacy
whole-object writes do not override existing property registers. This wire change does not add OOXML
properties or alter their units.

`wordParagraphIdentity(body, newlineOffset)` follows paragraph terminators through edits and remote
updates. It avoids a repeated scan from the start of the CRDT when projecting stable native block IDs.

`WordParagraphProjection(body, project)` consumes Yjs transaction deltas and retains unchanged
paragraph slices. A slice contains its stable terminator identity, UTF-16 length and formatted parts,
including the newline when present. The `paragraphs` getter invokes `project(slice)` only for changed
slices. Attribute retains that remove absent keys or assign equal values retain the original slice,
including absent-versus-empty attribute equivalence. Formatting undo therefore does not reproject
unformatted paragraphs merely because Yjs emits a broad attribute retain. Treat slices and projected
values as immutable, and call `destroy()` when finished.
`WordTableProjection.update(paragraphs)` reuses table trees whose projected paragraphs are unchanged,
while checking table contiguity across the entire result. These projections keep conversion work near
the edited paragraphs; updating offset arrays and semantic traversal still depends on document size.

Hosts that retain immutable authored objects can construct `NativeWordDocument` with
`immutableContent: true` to cache their signatures by identity. This is an explicit promise that
blocks and all descendants will not be mutated after being supplied. The default continues to detect
in-place authored-content changes. Paragraph text extraction is cached by immutable native-node
identity in both modes. Unchanged immutable tables without numbering or source-continuation
dependencies replay their retained descendants instead of rebuilding them; duplicate identity checks
and drawing registration still run. Tables with those dependencies retain semantic traversal.

### Header and footer page numbers

`wordPageNumberRuns` creates editable text and live `PAGE` / `NUMPAGES` fields.
Use it with `NativeWordDocument.updateStory` for a header or footer:

```ts
model.updateStory({ section: 0, kind: 'footer', type: 'default' }, [{
  kind: 'paragraph',
  alignment: 'end',
  runs: wordPageNumberRuns('bold-x-of-y'),
}]);
```

Presets are `plain`, `page`, `x-of-y`, `bold-x-of-y`, and `page-x-of-y`.
Fields occupy one `\uFFFC` character in authored content, with `field: 'PAGE'`
or `field: 'NUMPAGES'`. Header/footer layout resolves each field before measuring
and repeats pagination when the total changes. Formatting and ordinary surrounding
text remain editable. DOCX export writes standard simple fields. Supported simple
fields and complete complex `PAGE` / `NUMPAGES` fields split across runs import as
the same editable content. Editing or deleting a complex field also replaces its
source instructions and cached result on export. Direct artifact deletion removes
all owned markers, instructions and cached content, retaining neighboring run content.
`move-object` retains field semantics and formatting across paragraphs. Page-number
insertion inherits character formatting only, including at paragraph and table-cell starts.
Nested general fields project stored results in order without evaluating instructions.
Section numbering restarts and numeral formats are not yet evaluated by this API.

### Editable table formatting

Authored table cells accept `format` with `shading` (`#RRGGBB` or `transparent`),
`borders` (`top`, `right`, `bottom`, `left`), `verticalAlignment` and `margins` in
Twips. Tables accept `rowFormats`, parallel to `rows`, with `heightTwips` and
`heightRule` (`auto`, `atLeast`, `exact`). Column widths remain in points.

```ts
const cell = {
  format: { shading: '#F3F3F3', verticalAlignment: 'center' as const },
  blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Heading' }] }],
};
```

Native updates and DOCX export preserve these edits. Partial border edits retain
other source border edges and unrelated cell properties. Layout includes cell
shading and resolved `table.borders` segments, shared edges appear once even beside
merged cells. The Svelte renderer consumes those segments; custom renderers can
use `wordTableBorderCss` from `@tumblerjs/svelte`.

For collaborative documents, use a `table-format` change through
`createWordCommands().wordTransaction`, with the same anchored target, table ID
and cell ID as structural table edits. Its `patch` selects `cell`, `row`, `column`
or `table` scope, and accepts `cell`, `row`, and `columnWidths` changes. Row height
always applies to the target row, or all rows for table scope. The operation changes
paragraph metadata without replacing cell text, preserving collaboration and undo.

This supports direct table/cell border and solid fill properties. Conditional table
styles, theme-based table colours, patterned fills and the full OOXML border-style
set are not yet resolved. Source XML outside edited properties remains preserved.

### Table pagination

Rows can continue across pages at cell line boundaries. Each cell retains its paragraph
IDs and text offsets, and leading header rows repeat on continuation pages. An empty
paragraph before a tall row does not force the whole row onto another page. Nested table
content keeps its order relative to the surrounding paragraphs.

`cantSplit` moves a row to a fresh page when needed; if it is taller than a full page,
its contents still continue across pages, as required by ISO/IEC 29500-1 §17.4.6.
An indivisible line or drawing taller than the page follows the paragraph layout fallback:
it is placed once to make progress, without discarding its source content.

Table row sizing includes resolved horizontal border thickness as well as cell margins. Rows split across pages retain their top and bottom insets on each fragment.

### Document theme colours

`NativeWordDocument.themeColours` exposes the imported theme or the Office default for new
content. `wordThemePalette(theme)` builds the ten theme columns and their five shade rows.
`WordColour` accepts either a six-digit RGB string or `{ theme, fallback, tint?, shade? }`.
Tint and shade use WordprocessingML byte values from 0 to 255. `resolveWordColour` applies
Word's HSL luminance rules, and `wordColoursEqual` compares the selection's theme identity.

Text, shape fills/outlines, paragraph shading/borders and table cell shading/borders accept
these references. Native rendering resolves them against the document theme; DOCX export
writes theme references and their transforms. New packages embed a theme; pass
`themeColours` to `createWordArtifact` or `NativeWordDocument` to choose a custom scheme.
Complex DrawingML colour effects beyond the supported luminance transforms remain opaque
and retain their original XML.

Document page colours from `w:background` are exposed as `WordDocument.background`,
retaining RGB or theme references. Package and native layouts expose the resolved
CSS colour as `WordLayout.background`; apply it to the whole page, including margins.
The Svelte Word viewer does this automatically. Missing or automatic colours use
the viewer default. Background XML survives content edits and export. VML gradient,
pattern and image backgrounds are preserved but are not rendered.

### Shape text

`WordAuthoredShape.textBody` holds paragraphs and formatted runs, using the same
`WordTextParagraph` model as body text. It takes precedence over legacy `text`.
`textAnchor` places the text at the top, centre or bottom of the shape. DOCX
creation shares the body paragraph writer, including numbering resources.
Import resolves text-box run styles and preserves paragraph formatting. Text boxes
with unsupported nested structures remain opaque instead of losing their contents.

`textInsets` sets independent internal margins in points, for example
`textInsets: { top: 0, right: 2, bottom: 0, left: 2 }` for a compact label.
Omitted sides use the DrawingML defaults of 3.6pt top/bottom and 7.2pt left/right.
The editor, headless layout and canvas painter use the same margins. DOCX import
and export retain explicit values, including zero. These margins are separate
from paragraph spacing and the shape's distance from surrounding text.
Headless shape layout measures the complete text story before vertical alignment
and clipping, including text made visible by signed insets.
Values follow `ST_Coordinate32`, including signed insets, and serialize as EMUs
at 12,700 EMUs per point. See [ECMA-376 Part 1, fifth edition](https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip)
§21.1.2.1.1 and §20.1.10.17–18.

`WordShapeText` from `@tumblerjs/word/collaboration` exposes range replacement,
formatting, formatting state and rich clipboard fragments. Hosts persist its
`paragraphs()` output through their document transaction system. This engine uses
the same text operations as the collaborative body editor.

### Drawing placement

Pictures and retained drawings share `WordDrawingPosition`: `layout`, `wrap`,
`horizontalRelativeTo`, `verticalRelativeTo`, `x` and `y`. Coordinates are points in
the specified bases. `WordDrawingGeometry` adds `width` and `height` for retained
source drawings, including charts. Omit placement overrides to preserve imported
anchors and wrapping. An explicit `wrap: 'none'` removes imported text wrapping.
The collaboration layer accepts these properties on image and drawing attributes.

`wordDrawingPlacement(drawing, paintedBox, anchorLineY, choice)` converts painted
page coordinates into a placement. Choices are inline/front/behind and whether to
move with text. Newly chosen text-relative placement uses a line anchor; fixed
placement uses the page. Switching bases retains the painted location. Fixed page
coordinates do not pin the anchor to a permanent page number when text repaginates.

The geometry of retained drawings defaults to page-relative coordinates. Legacy
image properties retain their column-relative horizontal and paragraph/page-relative
vertical defaults through `moveWithText`. Explicit coordinate bases take precedence.
`WordArtifact.updateDrawing()` accepts the same bases for its `xPoints` and `yPoints`.
Native layout and DOCX export use the same coordinate bases.

Newly authored shapes with no `layout` now default to in front of text and fixed
relative to the page. Specify `layout: 'inline'` to request the former default.
Imported shapes have an explicit placement, which is retained during edits.

The placement model follows [ECMA-376 Part 1, fifth edition](https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip)
§20.4.2.3, §20.4.2.8, §20.4.2.10–15 and §20.4.3.4–5. In particular, `wrapNone`
and `behindDoc` determine placement in front of or behind text; anchor locking is
separate from the coordinate base. [MS-OI29500](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/1fd4a662-8623-49c0-82f0-18fa91b413b8)
revision 25.0, §2.1.1355, documents Word's restriction on `positionV` with
`relativeFrom="paragraph"`. New Move with text choices therefore use `line`, while
unchanged imported paragraph anchors remain intact. Shape creation defaults are an
authoring choice, not an ECMA restriction. Square, tight, through and top-and-bottom
text-flow layout are not implemented by this change.

Floating drawings retain horizontal `wp:align` placement. Page, margin, column,
and side-margin alignment is resolved against the final page bounds, including
inside/outside alignment on alternating pages. Vertical alignment remains outside
this support; numeric vertical offsets are unchanged.

### Author native ink

A `WordTextRun` can carry `ink: WordAuthoredInk` on one `\uFFFC` object character.
Each object is one stroke. Samples are local point coordinates with normalized
pressure; width and height describe the centreline frame, and size is the physical
pen width in points. Set `highlighter: true` for a translucent rectangular pen.
Placement uses the same page/paragraph coordinates as other drawings.

`createWordArtifact` writes calibrated Office InkML and its customXml relationship.
Export uses integer HIMETRIC coordinates and 0–1023 pressure, because desktop Word
rounds fractional channel values to integers. The collaborative source retains
the original point coordinates and normalized pressure.
`NativeWordDocument` previews the same native drawing and preserves subsequent
geometry and point overrides on export, including in a newly created document.
Authored ink is native-only; readers such as LibreOffice that discard InkML do not
render these strokes. No bitmap fallback or handwriting recognition is generated.

### Authoring ink drawings

Use `insert-ink` with `ink: { width, height, strokes }` to create one editable
native drawing. Each stroke supplies `points: [[x, y, pressure], ...]`, `color`,
`size`, and optional `highlighter`. Coordinates and dimensions use points;
pressure is between zero and one. All strokes share the drawing's coordinate
space, including empty margins. A single-point stroke creates a dot.

The entire drawing flows inline by default. For floating placement, set `layout`
to `front` or `behind` and supply `x`, `y`, `horizontalRelativeTo` and
`verticalRelativeTo` on the ink object. Use one drawing for related strokes so
that they move and resize together. `edit-object` can replace its complete ink
value, including all strokes. Existing single-stroke `points/color/size` inputs
remain supported with their previous fit-to-frame behavior.

### Line wrapping

Non-breaking spaces U+00A0, U+202F, and U+2007 retain their advance and do not
create word-wrap opportunities. Oversized unbreakable text still uses the existing
emergency character wrapping. A terminal explicit line break keeps an empty final
line, including its height and logical caret offset.

Justified paragraphs distribute unused line width across ordinary inter-word
spaces on wrapped lines and explicit line breaks. Final paragraph lines and
non-breaking spaces do not expand. The document compatibility setting
`doNotExpandShiftReturn` suppresses expansion on explicit line breaks. Tabs retain their stops; only spaces after
the last tab expand. Layout fragments expose the extra space advance as
`wordSpacing` in points. DOM renderers apply that value to CSS word spacing;
canvas renderers use the resulting fragment positions and widths.

### Preparation limits

`maxCharacters`, `maxAtoms`, and `maxMeasurements` bound preparation work per
layout pass, including unpainted whitespace, table cells, and repeated stories.
Defaults are 5,000,000 visited UTF-16 units, 1,000,000 glyph/control atoms, and
1,000,000 measurer calls. Each limit accepts a positive safe integer; callers
can raise it for larger documents. Exceeding one throws `limit_exceeded`.
The standalone story and resolved-paragraph layout functions accept the same
preparation options. Cached geometry avoids preparation and its measurement cost.

Body pagination prepares lines on demand. A preview may prepare an extra page
and bounded keep/widow lookahead before returning its requested pages. Aligned
tabs may need a full following segment to find its width; decimal tabs stop at
the decimal point. Such lookahead still consumes the preparation budgets.

Paragraph `positioning.tabs` contains direct tab declarations. An empty array emits
no `w:tabs` container and inherits style tab stops. When editing a source paragraph,
`tabs: []` removes its direct tab declarations; omitting `tabs` preserves them.
To remove an inherited stop, supply `{ positionTwips: 720, alignment: 'clear',
leader: 'none' }` at that position. Tab declarations are additive across styles.

Authored cell properties and paragraph/cell borders serialize in schema order,
regardless of the insertion order of their JavaScript properties.
