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

### Experimental native text transactions

`NativeWordText` is a plain-text editing experiment independent of XML, OPC, and synchronization.
`transact([{ start, deleteCount, insert }])` applies sequential UTF-16 edits atomically and preserves
unchanged paragraph identities. `NativeWordTextLayout` reuses the Word line-breaking implementation
and caches unchanged paragraph geometry. `docx(options)` packages the current text only when exporting.

This API does not import rich documents or preserve unsupported DOCX structures. Rich transactions,
pagination, and preservation-aware import remain future work. Kryptonote's `/document-lab` exercises
the native model with Yjs collaboration and small Convex updates.
