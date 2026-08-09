# WordprocessingML implementation status

This document defines Tumbler's bounded Word milestone 4. It is a capability
statement, not a claim of complete ECMA-376 or Microsoft Word compatibility.

The implementation follows ECMA-376 Part 1 sections 11 and 17, the package and
markup-compatibility rules in Parts 2 and 3, and Transitional exceptions in
Part 4. Relationship discovery is authoritative; `/word/document.xml` is not
assumed. Strict and Transitional namespaces are tested separately.

## Milestones

### Milestone 1 — semantic document and page flow

- Discover and bound the Main Document part.
- Model paragraphs, producer-split runs, visible text, tabs, breaks, fields,
  hyperlinks, bookmarks, revisions, unsupported inline nodes, and sections.
- Resolve document defaults, paragraph/character styles, `basedOn` chains,
  theme fonts and colors, and direct formatting without conflating specified
  and computed values.
- Produce explicit pages, columns, lines, fragments, source offsets, and
  deterministic geometry with bounded page and fragment budgets.

### Milestone 2 — lists and tables

- Resolve abstract numbering, instances, level overrides, starts, decimal,
  letter, Roman, and bullet markers without inserting marker text into content.
- Resolve table grids, omitted columns, spans, vertical merges, margins,
  preferred widths, row heights, and cell alignment while retaining source IDs.
- Render nested tables and paginate tables at inseparable row bands.
- Repeat leading `tblHeader` rows and honor exact row heights.

### Milestone 3 — document stories and drawings

- Resolve default, first, and even headers and footers per section.
- Resolve footnote and endnote parts and place note stories separately from body
  content.
- Resolve internal embedded images without fetching external relationships.
- Model inline and anchored placement and reuse `@tumblerjs/charts` for the
  supported DrawingML chart subset.
- Render body, nested, header/footer, and note tables through one owned Svelte
  table surface.

### Milestone 4 — owned client-side editing

- Map browser selections to logical paragraph offsets across producer-split
  runs and visual line fragments.
- Translate keyboard, composition, paste, and mobile `beforeinput` intent into
  controlled OOXML operations; the DOM is never canonical state.
- Insert, replace, and delete ordinary text with grapheme-safe boundaries.
- Split and join structurally simple paragraphs, preserving paragraph and
  uniform direct-run properties. Unsafe wrapper/container crossings fail
  explicitly.
- Apply font family, size, bold, italic, underline, color, and paragraph
  alignment across one or more paragraphs.
- Provide bounded undo/redo, dirty/save state, external-revision replacement,
  immutable artifacts, and focused package writes.
- Expose virtualized Svelte pages, native hyperlink/bookmark behavior, controlled
  editing callbacks, and the shared formatting toolbar without imposing an app
  shell.

## Capability matrix

| Feature family | Recognize | Preserve | Render | Edit | Interoperate |
| --- | --- | --- | --- | --- | --- |
| Main document, paragraphs, ordinary runs | Yes | Yes | Yes | Bounded text | Generated validation |
| Styles, themes, direct text properties | Yes | Yes | Yes | Basic direct properties | Generated validation |
| Sections, pages, columns, explicit breaks | Yes | Yes | Bounded | No | Not qualified |
| Numbering | Yes | Yes | Common formats | No | Not qualified |
| Tables, spans, vertical merges, nested tables | Yes | Yes | Bounded | Text in simple cells | Not qualified |
| Headers and footers | Yes | Yes | Paragraphs/tables | No | Not qualified |
| Footnotes and endnotes | Yes | Yes | Paragraphs/tables | No | Not qualified |
| Hyperlinks and bookmarks | Yes | Yes | Yes | Text only when safe | Not qualified |
| Stored field results | Yes | Yes | Yes | Result text only when safe | No recalculation |
| Embedded images | Yes | Yes | Common raster formats | No | Not qualified |
| DrawingML charts | Shared subset | Yes | Shared native subset | No | Not qualified |
| Floating drawings and wrap | Basic placement | Yes | Approximate | No | Not qualified |
| Tracked revisions | Insert/delete wrappers | Yes | Inserted result | No structural edits | Not qualified |
| Comments and content controls | Unsupported node | Yes | No | No | Not qualified |
| Macros, signatures, custom XML, embeddings | OPC inventory | Untouched on focused edits | No | No | Not qualified |

“Preserve” means untouched package payloads and unknown XML remain source-owned
during supported focused edits. It does not promise that deleting a containing
structural region can retain unknown descendants; those commands are blocked.

## Known layout bounds

Tumbler owns an explicit layout model because HTML flow is not a Word pagination
engine. Current geometry deliberately remains approximate where Word depends on
proprietary font substitution, language line-breaking, floating wrap polygons,
table-cell pagination, and iterative footnote continuation. Notes are positioned
at page bottoms but do not yet trigger a full iterative body repagination pass.
Anchored drawing wrap uses a bounded rectangular approximation.

Bi-directional shaping depends on the browser canvas and available fonts. Page
numbers and other general fields use stored producer results. Exact parity with
Word therefore requires visual qualification, not just schema validity.

## Editing safety policy

Ordinary text edits surgically change the Main Document part and reopen the
package before bytes escape. Paragraph boundary changes are accepted only when
all affected paragraphs contain ordinary text runs with uniform direct run
properties and share one OOXML parent. Fields, hyperlinks, revisions, bookmarks,
drawings, unsupported inline nodes, mixed direct formatting, and table/story
boundary crossings are rejected.

Formatting changes write only the direct property requested. They retain unknown
run-property children and do not flatten computed style values into every run.

## Qualification evidence

- deterministic Strict and Transitional generated fixtures;
- byte-identical no-op and untouched compressed-payload OPC tests;
- focused mutation/reopen tests for text and formatting;
- 150 randomized multi-edit histories and 100 randomized paragraph splices;
- bounded hostile ZIP/XML mutation suites inherited from OPC and OOXML;
- geometry assertions for wrapping, breaks, lists, tables, headers/footers,
  drawings, charts, notes, and virtualization;
- Svelte compiler checks for accessible owned page and table surfaces.

Microsoft Word, LibreOffice, Open XML SDK, real-producer visual corpus, pinned
font screenshot, memory, and large-document performance gates remain open. The
package stays explicitly early alpha until those external gates are reproducible.
