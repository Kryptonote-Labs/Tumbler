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
`defaultParagraphFormat` sets document paragraph defaults inherited by Normal and
other named styles. For example, `{ spacingAfterTwips: 160 }` adds 8 pt after
paragraphs. `lineSpacing: 1.15` sets the default line multiplier. Direct paragraph
formatting overrides these defaults; opening a source document retains its defaults.
`defaultFormat.kerningPoints` sets the minimum font size for kerning, in half-point
increments. For example, `kerningPoints: 1` enables kerning for text at 1 pt and
above. Individual runs can override the threshold. It is retained through import,
native layout and DOCX export. Explicit font names in styles and runs replace
inherited theme-font references; a theme reference on the same level takes priority.
Canvas-backed layout measures shaped text at an exact 1000px em and scales the
advance into document points. This avoids small-font rounding changing line breaks
at fractional display scales. Painting still uses the document's original font size.

### Sample text

`wordSampleText('=lorem(5,3)')` generates five paragraphs of three sentences.
`=rand()` generates original English filler; `=lorem()` generates Latin filler.
Both accept optional paragraph and sentence counts, defaulting to three each,
and ignore case and horizontal whitespace around the command and arguments.
Counts must be positive safe integers. Malformed commands return `undefined`.
The generated text is deterministic and uses LF between paragraphs, without a
trailing LF. English text is not localized or copied from Word's help text.
Hosts can supply a nonempty sentence array as the second argument, such as
`wordSampleText('=rand(2,1)', ['Custom sentence.'])`. This replaces only the
`=rand()` corpus; command parsing, counts and `=lorem()` remain the same.

Custom editors can call `wordSampleTextEdit(document, selection)` on Enter. It
returns a replacement only when the caret is collapsed at the end of a paragraph
containing the command alone, including paragraphs inside table cells:

```ts
const edit = wordSampleTextEdit(session.artifact.document, selection);
if (edit) session.replaceText(edit.selection, edit.value);
```

The replacement includes a final empty paragraph for continued typing. Apply it
through the host's normal edit/history path so expansion is one undoable change.
`@tumblerjs/svelte`'s `wordInputEdit` does this translation for `insertParagraph`;
typing, pasting and Shift+Enter do not trigger expansion.

The command syntax follows [Word's sample-text utilities](https://support.microsoft.com/en-us/word/how-to-insert-sample-text-in-microsoft-office-word).

Adding lists or tables to an imported Strict document emits Strict numbering,
theme and table vocabulary. Table widths and cell margins use physical units and
reopen as integer twips in the model. Existing resource parts are preserved when
content edits do not change them. This bounded conversion does not validate an
entire package or establish desktop Office interoperability.

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

### Structured collaborative tables, schema 2

Concurrent table structure uses stable row and column identities. Numeric grid
positions are derived from their shared ordering records. Row insertions also
record the vertical-merge coverage observed at insertion, so deleting a neighbor
cannot change the inserted row into a different kind of cell. Vertical merge
groups retain their original identity when a restart row is deleted. Editing a
continuation is rejected with `WordTableConflict`; select its visible restart
cell instead. The grid exposes `verticalGroup` to distinguish adjacent groups. Existing cell text stays
in its original Y.Text; new intersections use deterministically named, initially
empty Y.Text roots. Concurrent first typing therefore edits one shared character
sequence, without inserting duplicate paragraph terminators.

Cell root names are opaque identities. Existing v2 names remain stable. Deeper
canonical nesting uses a coordinate path with linear growth, preserving its exact
parent root without repeatedly escaping the complete ancestry. Story names have
no document-authoring length limit.

This is a breaking host API migration. A body-only `applyDelta` cannot commit
changes to cell roots or structural records. Upgrade every writer and persist and
transport **complete Y.Doc updates**, including all named roots. Coordinate the
protocol upgrade before permitting schema-2 edits. Migration marks the legacy
cell metadata with `schema: 2`, which old validated writers reject. Direct Yjs
mutations that bypass validation remain the host's responsibility.

Use the operation document's prepared-update executor:

```ts
const session = openWordOperationDocument(artifact);
const prepared = session.prepare([
  { kind: 'migrate', table: { story: 'body', table: inspectedTableId } },
]);
session.commit(prepared);
const history = session.history(); // Start editing history after migration.
const cell = session.grid(inspectedTableId)[1]!.cells[1]!.address;
const selection = session.commit(
  session.prepareOperation(
    { cell, range: { start: 0, end: 0 } },
    { name: 'replace', input: { value: 'Hello' } },
  ),
  history.origin,
);
const bytes = session.artifact().bytes();
history.destroy();
session.destroy();
```

`prepareWordUpdate` and `commitWordUpdate` provide the same contract directly for
Y.Doc hosts. Preparation and commit preflight the whole shared document on a
replica. A rejected operation leaves the original unchanged. Remote updates must
still be retained when they expose a conflict; validate with
`validateWordSharedDocument` and show the recoverable `WordTableConflict`.

Selections use `{ cell: { story, table, row, column }, range }`. Offsets are local
to the selected payload. `anchorScopedSelection` and `resolveScopedAnchor` retain
Yjs-relative positions; an empty-cell anchor resolves to its logical cell's start.
Story-scoped edits that touch migrated source cells, including nested ancestry,
are rejected. Canonical cell roots also require cell-scoped selections. Object
move destinations receive the same guard. The grid exposes `payloads` for selecting the original paragraphs of an explicit
merge. Navigation should enumerate `session.grid()` rather than physical body
paragraphs. Object move destinations are cell-local and validated against the selected
payload. `fit-table` uses current projected widths when weights are omitted.
A missing payload is an editable empty cell. First edit materializes
it automatically; reads and selection changes emit no repair writes.

`WordStructuredProjection` observes the complete document, including cell-root
updates. `projectWordSharedDocument` performs an uncached projection. The old
`WordTableProjection`/`groupTableParagraphs` rendering path rejects schema-2 cells
instead of rendering obsolete body-grid positions. `tableParagraphs` remains a
low-level view of retained legacy source paragraphs, not the logical grid.

Migration does not copy or delete legacy characters. Identical concurrent
migrations write the same canonical baseline record. Different baselines report
a migration conflict. Imported sources, nested ancestry, spans, widths, and grid
omissions remain available. New tables created through `prepareOperation` migrate
in the same prepared update. Splitting an imported span after deleting its first
column attaches its source to the chosen surviving coordinate. Restoring an old
coordinate does not duplicate that source. Concurrent splits that choose different
coordinates report a conflict; an explicit split at one surviving choice resolves
it without deleting the source text. Existing body-delta table edit/format helpers reject
migrated tables; switch those callers to the scoped operation adapter.

Deletion retains payloads and records what the deleting peer observed. Concurrent
edits that would be hidden produce a conflict; `restore-axis` or `restore-table`
can expose them again. Deletion witnesses include nested stories recursively.
Whole-table deletions keep separate records so concurrent deletions and their undo
do not overwrite each other. When a linear edit also consumes the paragraph break
before a deleted table, its physical separator stays with the retained baseline
and is omitted from the logical paragraph flow. Export uses the same projection
as the editor, including those joined paragraphs.
Deleting an axis updates observed explicit merges; undo restores that coverage.
Each merge operation retains its own identity. Equivalent concurrent coverage
projects once; contradictory overlapping coverage blocks export. Sequential
extension consumes the observed neighboring merges. Deletion witnesses include
source paragraph terminator attributes, derived-cell registers and cell formatting.
Row deletion also witnesses row formatting; column deletion witnesses column widths.
Structural undo retains these formatting records even when a cell has no text.
An explicit `restore-axis` exposes the retained cells without recreating retired
merge records. Select merged-cell text through the grid's `payloads`; covered
coordinates that do not name a visible payload are rejected. `inspectWordTableState` exposes retained axis records even
when export is blocked. Overlapping merge coverage, contradictory axis order,
conflicting migration baselines, and unions exceeding the package's 63-grid-column
limit also block export. Content is never flattened into other cells to satisfy
the limit. Explicit split/restore/delete operations resolve supported conflicts.

Use `WordStructuredUndo` with its local `origin`, not a body-only Y.UndoManager.
It rehearses the next undo or redo against a disposable current snapshot before
changing the live document. This preserves remote text and rejects an undo that
would detach it, without replaying the session's update history. Snapshot cost
still depends on document size. Destroy the history when the editor closes.
Hosts that need direct access to history stacks and selection metadata should use
`createWordUndoManager(doc, { trackedOrigins, captureTimeout })`, then call
`preflightWordUndo` with an additional source/permission validator before applying
undo or redo. Guarded undo rejects foreign managers or changed item filters.
An arbitrary Yjs `deleteFilter` can close over live object identities or split an
atomic document operation; it cannot be safely reproduced against a disposable
document. Select local edits through tracked origins instead of filtering items.
Migration belongs outside this editing history. The canonical empty cell's final paragraph boundary
is virtual; formatting it uses separate shared registers, and only user-entered
paragraph breaks and boundaries required before nested tables become actual
characters. Formatting an untouched empty cell needs only its format map;
projection includes its virtual paragraph even when no text root exists. Structural
undo treats these format-only roots as retained content. Empty named table maps left by undo are inert; retained remote cell
content still prevents a destructive structural undo.

DOCX export contains ordinary cells and valid table grids. Implicit intersections
become empty cells at their actual coordinates. DOCX does not preserve CRDT axis
identities or history; persist Yjs updates alongside the exported file when the
collaborative session must continue.

The reproducible fixture benchmark is
`packages/word/benchmarks/table-structure.ts`, with raw results in
`table-structure-results.json` beside it. Copy the script unchanged to audit
commit `4d1465d`, then run the following sequentially under one lock:

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock bash -c '
  timeout 5m bun /path/to/audit/packages/word/benchmarks/table-structure.ts legacy
  timeout 5m bun packages/word/benchmarks/table-structure.ts structured
'
```

On Bun 1.4.4 and an Intel Celeron N5095, a 12×4 table with two local column edits
and ten healthy validation/grid-read pairs took a median 10.731 ms before and
123.370 ms after, across seven samples following three warmups. Raw total times
ranged 9.186–11.439 ms before and 116.919–127.207 ms after. Median CPU time rose from
21.164 to 152.545 ms, full peer-state bytes from 35,052 to 45,832, and net heap
change from 114,428 to 456,788 bytes. These are correctness costs, not a speedup.
One-time migration took a median 18.042 ms, measured separately. The unchanged
retained-text hash matched in every sample; merged validation changed from 0/7
successes to 7/7. Heap change is not a measure of total allocated bytes.
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

Text edits and `WordArtifact.replace` preserve the active header/footer part and
open options, including ink rendering and parse limits. Retaining parse limits
across edits is an intentional extension of the original invocation-scoped open
contract, not a correction to a previously promised session-wide limit. Each reopened revision
gets fresh parse counters across the main document and its parsed stories; limits
are not a cumulative editing-session allowance. Intermediate revisions must also
fit those limits. `replace(bytes, options)` can explicitly override them. A rejected
edit leaves the input artifact and its package bytes unchanged.

Paragraph joins and replacements reject crossings through tables, content
controls, or other opaque XML blocks, even when those blocks have no projected
text. Paragraphs in different containers cannot be joined.

Splitting a paragraph moves its `w:sectPr` to the final continuation, preserving
one section boundary. Multi-paragraph joins or replacements containing section
properties are rejected until section-boundary transformations are supported.


### Connecting linear editors to shared tables

`wordSharedText(doc.getText('body'))` returns a cached `WordSharedText` adapter.
Its `text` is a local rich-text projection in logical document order, including
implicit cells and nested tables. Use it for layout, text hit testing, formatting
state and paragraph/table inspection. Treat it as read-only. Never persist or
synchronize its Y.Doc; persist complete updates from the adapter's authoritative
`doc` instead. `wordSharedOwner` resolves the projection document to that owner
when a host needs its retained source or metadata.

```ts
const view = wordSharedText(doc.getText('body'));
const target = view.anchor({ start: 10, end: 10 });
// After receiving other peers' complete document updates:
const range = view.resolve(target);
const edit = view.prepareOperation(range, {
  name: 'replace', input: { value: 'Hello' },
});
view.commit(edit, history.origin);
// edit.range is the resulting selection in the linear view.
```

Operations use the visible paragraphs and cell payloads, including joins around
retained table content. Ranges and `move-object` destinations use linear view
coordinates. Host operation callbacks receive an isolated snapshot with the same
story name and document metadata, including formatting defaults. Use the returned
`range` for editor selections. The
optional `selection` is omitted when that range crosses hidden source content
and cannot be represented by one contiguous scoped selection. Clearing a cell
retains hidden table baselines and their required separators for undo and validation.
Scoped and linear nested-table insertion use the same cell-local operation path.
Both source and canonical cells retain the preceding paragraph and exactly one
trailing parent paragraph after inserting into their final paragraph.

`prepareDelta(delta)` translates existing editor deltas into payload-local edits.
It retains source cell boundaries, rich pasted text and virtual paragraph
formatting. Pasted tables migrate in the same update. `prepareChanges(changes)`
executes anchored batches, including table structure, cell formatting, object
moves and expected-text checks. All prepare methods leave the owner unchanged
and return complete updates, which `commit` revalidates before one atomic write.
Hosts still validate package provenance, asset access and editing authority.

`anchor` and `resolve` use authoritative character identities and cell addresses,
so a selection in a new empty cell survives other peers inserting columns before
it. Paragraph identities also come from shared terminators, not the local
projection's Yjs client ID. `prepareMigration()` can be committed separately
before starting the user's undo history. Read-only clients do not migrate data.

A conflicting projection throws the retained `WordTableConflict` rather than
returning an outdated document that might omit hidden edits. The complete source
state remains available for inspection and explicit restore operations. Once the
conflict is resolved, the existing adapter resumes normal reads. Destroy an
adapter explicitly or destroy its owning Y.Doc when the session closes.

Structured read caches invalidate at transaction boundaries and are bypassed
during writes, so multiple writes inside one transaction see current state.
Repeated validation and projection reuse parsed records and source-cell ranges.
On the same Linux arm64 host with Bun 1.4.0, the unchanged 12×4 benchmark's median
total for two column edits and ten validation/grid-read pairs fell from 164.066 ms
to 24.416 ms. Median reads fell from 115.436 ms to 9.231 ms, and edits from
46.379 ms to 14.880 ms. Both revisions passed merged validation in all seven
samples and retained the same text hash and 45,832 state bytes. These numbers
cover this synthetic fixture, not general editing latency. Revisions and raw
samples are in `benchmarks/table-structure-read-cache-results.json`.

### Page colour

`NativeWordDocument.updateSettings({ background })` changes the native layout and
DOCX export together. A colour can be RGB or a theme reference. `null` removes the
background; an omitted property preserves the imported value. Calling
`updateSettings({})` restores the source settings.

Collaborative hosts use `prepareWordDocumentSettings(doc, patch)` and
`commitWordUpdate`. Settings use separate property registers in `word-settings`
and participate in the document's undo history. The `page-color` operation is
available through `prepareWordScopedOperation`, `WordSharedText.prepareOperation`
and `openWordOperationDocument`. The legacy text-delta API cannot carry document
settings and rejects this operation.

Exports write ECMA-376 Part 1 §17.2.1 document backgrounds and §17.15.1.26
`displayBackgroundShape`, preserving theme identities and unrelated package data.

### Section layout

`updateSettings({ finalSection: { ... } })` edits the final section's paper size,
orientation, margins and columns. Measurements are twips, 20 per point. Authored
paragraphs can end a section with `section: { format, source? }`. The optional
source is an existing `sectPr` identity whose opaque properties and story links
must be retained. `section: null` explicitly removes an imported boundary.

Collaborative `section-layout` operations apply to the current section or the
whole document. `section-break` inserts a continuous, next-page, next-column,
odd-page or even-page boundary. `remove-section-break` joins it using the following
section's properties. Pass the immutable source in the scoped operation context;
`openWordOperationDocument` supplies it automatically. `inspectWordSections`
returns the same section ranges and resolved settings used by these operations.
Separate property registers preserve concurrent changes to different settings.

Columns support equal widths or explicit `columns: [{ widthTwips, spaceTwips }]`,
with optional `columnSeparator`. Set `columns: null` when switching back to equal
widths. Continuous sections can change column geometry on the same page. The
preceding section balances at a continuous section break by repaginating through
the existing paragraph and table rules. Open final sections and page/column section
breaks fill each column down to the available page height before moving across. `wordColumnSeparators` and `WordPageLayoutDecorations` expose the
same geometry to canvas and Svelte consumers.

These settings follow ECMA-376 Part 1 §§17.6.3–4, 17.6.11, 17.6.13 and 17.6.22.
Hyphenation is unchanged.

Shared-document hosts can bind immutable imported geometry with
`bindWordLayoutSource(doc, artifact)` or the `layout` baseline in
`createWordSourceManifest`. Staging, commit and guarded undo validate the composed
page box against this baseline. Invalid combinations of independently prepared or
remote settings are rejected before the live document changes. Remote updates
must pass `commitWordUpdate` or staged `validateWordSharedDocument`; applying raw
Yjs updates alone does not perform document validation. Documents without layout
edits retain their existing text-validation cost.

Removing a section break preserves effective inherited header/footer references on the surviving section. Section format `headerReferences` and `footerReferences` can reuse existing source relationships; unknown or mismatched relationships are rejected.
### Line numbering

Section format `lineNumbers: { countBy, start, restart, distanceTwips? }` enables
line numbers. Restart modes are `newPage`, `newSection` and `continuous`.
`lineNumbers: null` disables numbering. The same `section-layout` operation edits
these values for people and agents, with document undo and DOCX export.

Paragraph `suppressLineNumbers: true` removes its lines from the count, including
when inherited from a style. Tables count once; their cell contents, auxiliary
stories and text-box contents do not receive line numbers. Number markers follow
the `LineNumber` character style and use the same positions in native, package,
canvas and Svelte layouts. Numbers remain outside editable document text.

The markup follows ECMA-376 Part 1 §17.6.8 and §17.3.1.35. Table counting follows
[Microsoft Word's documented behaviour](https://support.microsoft.com/en-us/word/add-or-remove-line-numbers).

Line-number `start` is the displayed first number. Word's stored `w:start` is a
skip count, so the engine translates between the API's 1 and Word's 0. See
[MS-OE376 §2.1.214](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/7b579d67-5dd6-4e60-b176-31b8157addd0).

### Embedded document fonts

`readWordEmbeddedFonts(artifact.document)` reads the font table's internal regular,
bold, italic and bold-italic font parts in Strict and Transitional packages. It
returns document-scoped font bytes with ECMA-376 §17.8.1 obfuscation removed, without
changing the package. These bytes are for rendering their owning document.

Browser hosts can pass this array to `loadEmbeddedFonts` from `@tumblerjs/svelte`,
then use its family resolver for both text measurement and rendering.

Imported `w:kern` thresholds are inherited through run styles. Kerning applies at
or above that point size, with zero disabling it. Canvas measurement, painting and
Svelte text CSS use the same rule. Layout measures compatible text as a consistent shaped prefix on each line,
including ligatures, and reshapes carried text at a new line.

### Explicit positioning and hyperlink resets

`importWordContent` returns direct paragraph positioning, including tab-clear
entries. Inherited values remain in their styles instead of becoming edit
attributes. Use `WordStyles.paragraphFormat(document, paragraph)` or the native
model's `paragraphFormat` for effective positioning. `WordStyles.paragraphPositioning`
returns only direct source declarations. This distinction lets an indent-only edit
preserve source tab clears while an explicit replacement tab array replaces them.

For `paragraph` operations, omitting `positioning` or supplying `{}` preserves the
current positioning. Partial objects update their supplied members. `positioning:
null` removes direct paragraph indents and tabs, allowing paragraph styles and
document defaults to apply. Yjs consumes null attributes, so commands store this
intent as `positioning: { reset: true }`. The same object works in authored content
and `NativeWordDocument`; it can include replacement positioning members. The
marker survives projection, undo and collaborative updates, and is not written to
OOXML. Unrelated source XML remains preserved.

For `format` operations, omitting `link` preserves it; `link: null` and `link: ''`
both unlink. Commands store the existing empty-string sentinel so native projection
and source-aware export cannot restore the old hyperlink. In authored content,
use `link: ''` to unlink and omit `link` to preserve the source wrapper.

Resetting tabs removes the old stops and metadata attached to those stops. Without
replacement stops, export removes the entire direct `w:tabs` property, including
its attached extension markup. With replacements, container-level extensions and
namespace bindings remain; metadata owned by removed stops is removed with them.
Unknown indent attributes and children remain when recognized indent attributes
are reset. Omitted or empty positioning patches retain all original metadata.
Style and default tabs still apply, following
[ECMA-376 §17.3.1.38](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tabs).

Imported targetless hyperlink wrappers omit the public `link` attribute and retain
their source identity. This keeps no-op exports intact while reserving `link: ''`
for explicit unlinking.

### Native document archives

`createWordNativeArchive(artifact)` converts an imported Word package into compiled document
semantics and immutable binary resources. Hosts can store `model` and each resource as separate
SQLite blobs, outside the collaboration state and operation log. `openWordNativeArchive(archive)`
restores the engine without reading a DOCX or parsing XML. The compiled
body and header/footer models retain their resolved formatting and source identities.

```ts
const native = createWordNativeArchive(openWordArtifact(uploadedBytes));
// Persist native.model and native.resources, then discard the uploaded DOCX.
const source = openWordNativeArchive(native);
const document = new NativeWordDocument({ source });
```

The archive owns every original package member, relationships, content types, lossless XML bytes
and lexical source bytes, including unknown extensions and binary parts. Original XML identities
remain preservation references; they are not a dependency on an original ZIP or file. Editing uses
the compiled model. Export materializes a package from the retained resources and current content.
Unchanged member payloads, compressed member data and opaque ZIP headers survive native reopening.
An unedited native source reconstructs the exact uploaded ZIP bytes, including directory records,
comments and metadata. Edited exports can regenerate ZIP headers; this does not promise byte-identical ZIP
container metadata. Opaque OOXML and package payloads remain exact.

`encodeWordNativeArchive` and `decodeWordNativeArchive` provide a portable binary envelope for
transport. Model and resource integrity checks reject missing, truncated or corrupted data. Native
archives are versioned engine state produced by Tumbler, not an additional untrusted user import
format. Do not put these immutable resources into each collaborative edit or flatten unrecognized
objects into JSON: the codec deliberately rejects object types it cannot preserve.

Locally prepared collaborative updates carry a validation proof tied to their owner, full CRDT
snapshot, root identities and layout baseline. An unchanged local preparation can commit without
building another validation replica. Received, modified and stale updates still validate the full
composed document. Snapshot freshness includes deletion-only changes.
