# WordprocessingML implementation status

This document describes Tumbler's Word package and native editing APIs. It is a capability
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
- Render nested tables and continue rows across pages at cell line boundaries.
- Repeat leading `tblHeader` rows when enabled. Explicit `false`, `0`, and `off` disable repetition; `true`, `1`, `on`, and an omitted value enable it. Honor exact row heights. Cell content is clipped to the placed cell rectangle in DOM and canvas output, including ancestor clips for nested tables. Wrapped floating drawings with `wp:anchor layoutInCell="0"` or `"false"` retain their outside-cell placement and page clipping; inline and wrap-none drawings retain cell clipping. Signed shape text insets keep their geometry: text outside the shape remains visible within the cell and is clipped at cell and page boundaries. Pointer hit testing excludes fully clipped lines and uses the visible part of partially clipped lines. Hidden text and offsets remain available for document-order selection and editing. Floating drawings retain their cell clip in the separate canvas paint pass. DOM drawing content shares the page stacking order with text, while editing controls remain outside the cell content clip. Native ink pixel reads and writes intersect that clip explicitly, because pixel writes bypass canvas clipping. Device-pixel viewport crops and page-point cell clips are intersected before converting to viewport-local pixels.

### Milestone 3 — document stories and drawings

- Resolve default, first, and even headers and footers per section.
- Content reconciliation creates shared styles and themes through the Main Document
  relationship, including when a header or footer is edited first. Images and
  hyperlinks remain related to their story. Existing styles and themes are reused;
  Strict exports use Strict relationship and theme namespaces.
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
| Numbering | Yes | Yes | Common formats | Authored bullet/decimal lists | Not qualified |
| Tables, spans, vertical merges, nested tables | Yes | Yes | Row continuation and repeated headers | Native structure and direct cell/row formatting | Not qualified |
| Headers and footers | Yes | Yes | Paragraphs/tables and page fields | Shared stories and section variants | Not qualified |
| Footnotes and endnotes | Yes | Yes | Paragraphs/tables | No | Not qualified |
| Hyperlinks and bookmarks | Yes | Yes | Yes | Text only when safe | Not qualified |
| PAGE and NUMPAGES fields | Simple and complete complex forms | Yes | Live in header/footer layout | Native fields and presets | No section numbering evaluation |
| General fields | Partial | Yes | Some stored results | Limited | No general recalculation |
| Embedded images | Yes | Yes | Common raster formats | PNG/JPEG authoring, movement and resizing | Not qualified |
| DrawingML charts | Shared subset | Yes | Shared native subset | Drawing movement and resizing | Not qualified |
| Floating drawings and wrap | Basic placement | Yes | Approximate | Inline/front/behind placement | Not qualified |
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
complex table interactions, and iterative footnote continuation. Notes are positioned
at page bottoms but do not yet trigger a full iterative body repagination pass.
Anchored drawing wrap uses a bounded rectangular approximation.

Bi-directional shaping depends on the browser canvas and available fonts. Supported
PAGE/NUMPAGES fields resolve during header/footer layout. General fields are not
recalculated; some stored results render. Section page-number restarts and numeral
formats are not evaluated. Exact parity with
Word therefore requires visual qualification, not just schema validity.

## Editing safety policy

The following restrictions describe package-backed text replacement. Native rich-content
editing and the optional collaboration adapter additionally support imported source
references, structural table operations, images, story updates, and page fields.
See the Word package README and public authoring/collaboration guides for those APIs.

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

## Aligned tabs

Tab-delimited segments honor left, center, right and decimal stops across run
boundaries. Positional tabs retain their alignment and margin/indent reference;
occupied positional targets continue on the next line. Tab leaders remain a
rendering follow-up. Layout tests assert segment positions, not just parsed styles.

Authored paragraphs expose `positioning` with tab stops and indents in twips.
Authored runs can contain one positional `tab`. The native engine, DOCX importer
and exporter share these properties. In collaborative text, paragraph positioning
lives on the terminating newline and positional-tab metadata on the tab character;
ordinary typing does not inherit the tab metadata.

The collaboration adapter exposes `wordPageNumberRange`, `pageNumberEdit`,
`wordItemAlignment`, and `alignWordItem`. Hosts distinguish explicit insertion
from updating a selected recipe. Placement preserves neighboring character
identities and returns a selection with one validated delta for undo grouping.

`wordClickAndTypeTarget` resolves blank-space intent from layout coordinates.
`clickAndTypeEdit` turns the target into editable paragraphs and tabs in one delta.
It leaves clicks on existing ink to ordinary text selection. Hosts constrain the
layout lines and bounds to the active story or table cell before calling it.

## Native character authoring

Native authored content and collaborative commands support strike, the Word highlight palette, superscript/subscript and signed twip character spacing. Imported edits retain surrounding runs and can explicitly clear these properties. Character-formatting compatibility fixtures require semantic assertions, Open XML SDK validation and LibreOffice round trips. These bounded checks do not claim full topic coverage.

Native paragraph authoring now includes before/after spacing, automatic/exact/minimum line spacing, keep-with-next, keep-lines, page-break-before, widow control, contextual spacing, shading and basic borders. Collaborative paragraph patches preserve other properties on each selected paragraph. Paragraph decorations render in body, story and table views. Border artwork and automatic border joining across adjacent paragraphs remain unqualified.

The collaborative API provides literal find/replace with case and whole-word options. Search returns UTF-16 ranges at grapheme boundaries. Replace-all anchors matches before mutation and uses one ordinary transaction, preserving each match's inherited formatting and undo behavior.

Authored lists support decimal, lower/upper letters, lower/upper Roman numbering, custom bullet markers, nine levels, compound multilevel labels and explicit starting numbers. Restart by assigning a new list identity; continue with an existing identity. Native and exported markers share number formatting.

Authored runs can create or change HTTP(S), mail, telephone and bookmark hyperlinks. An empty link explicitly removes a source hyperlink while preserving its text and formatting. Imported exports remap new external relationships and retain unchanged source hyperlink wrappers.

Native and collaborative paragraph styles include Normal, Title, Subtitle and Heading 1–9. Headings serialize pStyle references and outline levels. Existing imported definitions take precedence over built-ins; missing requested built-ins are added at export. Named-style resolution works without XML reads during editing.

Authored line, page and column breaks occupy one line-separator character in collaborative text and serialize as explicit w:br elements. Break type survives import, native pagination and source-aware export.

Native shapes support rectangles, rounded rectangles, ellipses, triangles, diamonds, right arrows and lines, with dimensions, fill, outline and text. They serialize as editable DrawingML wordprocessing shapes and can use inline or floating placement. The Svelte shape view renders the same model. Full preset geometry, rich text-box formatting and shape effects remain unqualified.

The editable shape authoring API currently models seven preset geometries with solid RGB fills,
inline/front/behind placement and plain text. Imported groups, theme/effect fills, transformed
shapes and text-wrapped shapes remain opaque source drawings. Neighbouring edits preserve their
original markup; they are not flattened into the simpler editable shape model.

When assigning a style through `NativeWordDocument.update`, omit `paragraph` and each run's `format` to reset direct formatting to the style. Properties explicitly retained in the update remain overrides, including the effective formatting returned by `importWordContent`. Kryptonote's style action clears those overrides. Unknown imported style references retain Word's default-style fallback.
