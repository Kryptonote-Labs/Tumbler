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

The current reader/layout slice includes Strict and Transitional main parts,
styles and themes, numbering, sections and columns, tables and nested tables,
headers and footers, footnotes and endnotes, hyperlinks and bookmarks, embedded
images, and the shared native chart subset. Stored field results render, but
Tumbler does not recalculate general Word fields.

Paragraph-mark formatting determines empty-line metrics. Automatic line spacing
scales the measured font line box; exact and at-least spacing use the authored
point height. Browser measurers should include the font's line gap and avoid
rounding vertical metrics at each text size, since small errors accumulate across pages.

See the repository's
[WordprocessingML implementation status](../../docs/wordprocessingml-implementation.md)
for the exact capability matrix and known limitations.

MIT licensed. See [LICENSE](LICENSE).

### Structured authoring

`createWordArtifact({ blocks })` accepts paragraph, table and image blocks. A paragraph has
formatted `runs`, optional alignment and optional `list: { id, kind, level, start }` metadata.
Reuse a list ID to continue numbering; use a new ID to restart it. Levels range from zero to eight.
Tables have rectangular `rows` of cells, each containing `blocks`, and optional column widths in
points. Image blocks contain PNG or JPEG bytes, dimensions in points and optional alt text.
Images are embedded in the DOCX, with relationships created automatically. `blocks` and the
older `paragraphs` option are mutually exclusive.

Authoring limits include 10,000 blocks, 10,000 cells, eight nested table levels and 100 MB of
image data per document. Applications should enforce their own smaller limits where appropriate.
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

`wordParagraphIdentity(body, newlineOffset)` follows paragraph terminators through edits and remote
updates. It avoids a repeated scan from the start of the CRDT when projecting stable native block IDs.

`WordParagraphProjection(body, project)` consumes Yjs transaction deltas and retains unchanged
paragraph slices. A slice contains its stable terminator identity, UTF-16 length and formatted parts,
including the newline when present. The `paragraphs` getter invokes `project(slice)` only for changed
slices. Treat slices and projected values as immutable, and call `destroy()` when finished.
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
source instructions and cached result on export. Section numbering restarts and numeral
formats are not yet evaluated by this API.

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
