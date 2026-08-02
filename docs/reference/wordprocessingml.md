# WordprocessingML reference

Primary source: ECMA-376 Part 1 §§11 and 17. The informative primer is Annex
L.1. Transitional-only features are in Part 4.

## Package shape

The package's office-document relationship targets the Main Document part. The
usual path is `/word/document.xml`, but relationship discovery is authoritative.

A typical document graph includes:

```text
Main document
├── styles
├── numbering definitions
├── settings
├── font table
├── theme
├── headers and footers
├── footnotes and endnotes
├── comments and people-related extensions
├── images and drawings
├── hyperlinks
├── glossary document
└── embedded/custom parts
```

Headers and footers are related parts. A section can select different first,
even, and default header/footer references. Footnotes and endnotes are collected
in their own document-level parts.

## Main document hierarchy

The usual body structure is:

```text
w:document
└── w:body
    ├── w:p
    │   ├── w:pPr
    │   └── inline content
    │       └── w:r
    │           ├── w:rPr
    │           └── w:t / tab / break / drawing / field content
    ├── w:tbl
    └── w:sectPr
```

A paragraph is not a plain string. Its inline sequence can contain runs,
hyperlinks, bookmarks, proofing markers, fields, comment ranges, tracked-change
wrappers, content controls, drawings, tabs, breaks, and other nodes.

A run groups content sharing run properties, but producers can split visually
continuous text into many runs. UI commands must operate over logical text
positions without assuming one run equals one word or one formatting span.

## Text

Text usually appears in `w:t`. Whitespace behavior can depend on `xml:space`.
Tabs and breaks have their own elements. Symbols, deleted text, field instruction
text, and other textual content can use different elements.

Editing requirements:

- maintain a mapping between UI text positions and source inline nodes;
- split runs only where necessary;
- merge compatible runs cautiously, because bookmarks, revisions, proofing, and
  unknown nodes can make apparently adjacent runs semantically different;
- preserve space behavior at new leading/trailing whitespace boundaries;
- treat Unicode scalar, grapheme, word, and UTF-16 offsets as different units;
- never place the caret inside a structural marker that the format treats as an
  atomic boundary.

## Property cascade

Formatting can come from several layers:

- document defaults;
- table and numbering context;
- paragraph style;
- linked or character style;
- direct paragraph properties;
- direct run properties;
- theme/font/color resolution;
- revision or conditional table-style context.

Styles can refer to `basedOn`, `next`, and linked styles. Named style IDs are
document-local. Defaults and latent style information affect behavior.

Keep specified and computed properties separate:

```text
source properties → cascade context → computed render properties
```

Writing a computed value back as direct formatting everywhere destroys style
semantics and creates noisy files. A formatting command should modify the
narrowest intended source layer.

## Sections and pages

Section properties control page size, margins, orientation, columns, page
borders, numbering, headers, footers, notes, and other layout behavior. A section
boundary may be represented through paragraph properties, with final section
properties also appearing at body level.

Pagination depends on:

- available fonts and their metrics;
- line breaking and language behavior;
- paragraph spacing, indentation, tabs, and line height;
- widow/orphan and keep constraints;
- explicit page/column/section breaks;
- table row splitting and cell layout;
- floating drawings and text wrapping;
- headers, footers, notes, and footnote continuation;
- section columns and page geometry.

HTML flow alone will not reproduce Word pagination. Tumbler needs an explicit
layout model and visual compatibility measurements.

## Numbering

Numbering generally separates abstract definitions from concrete numbering
instances. Paragraph properties refer to a numbering instance and level. A level
defines format, text pattern, start value, indentation, and associated style
behavior.

Editing risks include:

- continuing versus restarting a list;
- copying paragraphs without copying/rebinding definitions;
- level overrides;
- style-linked numbering;
- placeholder substitution in number text;
- list indentation interacting with paragraph indentation.

Number appearance should be a computed layout product, not inserted into the
paragraph text.

## Tables

Tables contain rows and cells, but the visual grid can differ from the raw child
count because of grid definitions, spans, vertical merging, omitted cells, and
row/table properties.

Important concepts:

- table grid and column widths;
- preferred versus resolved widths;
- table, row, and cell properties;
- horizontal spans and vertical merge continuation;
- cell margins and borders;
- conditional table-style regions;
- nested tables;
- required paragraph content inside cells.

Selection and hit testing should use a resolved grid while serialization retains
source cell identity.

## Fields and hyperlinks

Fields can be simple or represented as a sequence of begin/separate/end markers
with instruction and result content. Results may be stale cached display values.
Page numbers, references, dates, tables of contents, merge fields, and many other
features use fields.

Initial policy should recognize and preserve fields, render their stored result,
and expose whether recalculation is unsupported. Editing display text must not
accidentally destroy the field instruction.

Hyperlinks can target external relationships or internal bookmarks. External
targets remain subject to host security policy.

## Drawings

Word supports inline drawings and anchored/floating drawings. Anchored objects
add positioning relative to page, margin, column, paragraph, or character plus
wrapping, overlap, distance, and z-order behavior.

DrawingML describes the object; WordprocessingML drawing markup describes its
placement in document flow. Keep these layers separate.

## Revisions, comments, and content controls

Tracked changes can wrap insertions/deletions and record property changes.
Comments use range markers plus related comment data. Content controls wrap
structured content and carry properties, aliases, tags, bindings, and locks.

These features intersect ordinary text operations. Until editable, Tumbler
should preserve their wrappers and prevent commands from producing invalid
crossing ranges. "Strip revisions" or "accept changes" would be explicit future
commands, never incidental parse behavior.

## First safe editing slice

A basic text-editing slice is complete only if it can:

- render paragraphs and runs with basic computed formatting;
- map selection positions across split runs;
- insert/delete text without damaging bookmarks or unknown siblings;
- preserve styles, numbering, headers, footers, drawings, and extensions;
- undo and redo edits;
- serialize only affected document markup;
- validate and reopen in Word and LibreOffice without repair;
- pass a focused no-op and mutation corpus.

## High-risk fixtures

- mixed RTL/LTR text and complex scripts;
- missing fonts and theme fonts;
- nested fields and hyperlinks;
- tabs with custom stops;
- section breaks inside edited regions;
- vertically merged table cells;
- tracked changes surrounding ordinary runs;
- content controls and bookmarks around zero-width boundaries;
- floating drawings with wrap polygons;
- alternate content containing drawings;
- documents with macros, signatures, custom XML, and embedded objects.
