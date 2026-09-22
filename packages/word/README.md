# `@tumblerjs/word`

Headless WordprocessingML reading, preservation, page layout, and editing for
browser-owned document experiences.

> **Extremely early alpha.** This is a bounded WordprocessingML slice, not a
> replacement for Microsoft Word. APIs and layout behavior can change without
> notice. Keep original copies of important files.

```sh
bun add @tumblerjs/word
```

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
