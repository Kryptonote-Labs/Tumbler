# Formats and UI

## Family strategy

Tumbler is an all-Office project. DOCX, XLSX, and PPTX share packaging,
relationships, XML compatibility, DrawingML, themes, preservation, commands, and
testing infrastructure.

They do not share one flattened editing model. A paragraph is not a cell and a
cell is not a slide shape. Sharing must follow real format concepts rather than
an aesthetic desire for reuse.

Development proceeds one format at a time through meaningful vertical slices.
The first format has not yet been selected. Selection should consider immediate
Kryptonote value, layout risk, available fixtures, and how well the slice proves
the shared layers.

## Common capability levels

Support should be reported per feature at one of these practical levels:

1. **Recognized** — Tumbler identifies the feature.
2. **Preserved** — it survives unrelated edits.
3. **Rendered** — the first-party head displays it.
4. **Editable** — supported commands can change it safely.
5. **Interoperable** — round trips pass the declared consumer matrix.

This prevents "supported" from hiding the difference between seeing a feature
and safely editing it.

## Word documents

### Initial vertical slices

- Open and inspect the package and main document.
- Render paragraphs and text runs.
- Resolve basic character and paragraph properties.
- Render sections and page geometry.
- Edit text through headless commands.
- Preserve styles, numbering, relationships, and unknown markup during a basic
  text edit.
- Save and reopen without a Microsoft Office repair.

### Progressive capabilities

- Style inheritance and themes.
- Lists and numbering.
- Tabs, line spacing, indentation, and pagination.
- Tables, merged cells, borders, and cell layout.
- Headers, footers, footnotes, endnotes, and comments.
- Images, anchors, wrapping, and DrawingML.
- Fields, hyperlinks, bookmarks, and content controls.
- Tracked changes.
- Columns, section breaks, and more exact pagination.

Word pagination is a layout engine problem, not merely HTML styling. Browser text
metrics, font availability, line breaking, floating objects, and page-breaking
rules must be tested explicitly. Fidelity should be reported honestly while the
layout engine matures.

The `dolanmiu/docx` project is useful as a document generator and source of
focused feature cases. It is not assumed to be the editing or preservation core.

## Spreadsheets

### Initial vertical slices

- Open workbook metadata and sheet order.
- Render a bounded cell viewport.
- Resolve shared strings, inline strings, booleans, numbers, dates, and basic
  cell styles.
- Navigate and select cells.
- Edit values and formulas as stored expressions.
- Preserve unrelated worksheets, drawings, names, and extension markup.
- Save and reopen without a repair.

### Progressive capabilities

- Row and column sizing, hidden state, frozen panes, and merges.
- Formula references and dependency recalculation.
- Number formats and locale-sensitive display.
- Tables, filters, sorting, validation, comments, and hyperlinks.
- Conditional formatting.
- Named ranges and structured references.
- Charts, images, and drawings.
- Rich text and print/page setup.
- Pivot-related content, initially preservation-only.

### TanStack

TanStack Table is promising because it is headless and separates state from UI.
It should be prototyped, not automatically adopted as the spreadsheet engine.
Spreadsheet behavior extends beyond a data table: two-dimensional virtualization,
merged cells, arbitrary coordinates, formula references, range selection, frozen
panes, and dense keyboard interaction are central.

The evaluation should compare:

- TanStack Table plus TanStack Virtual;
- TanStack Virtual with Tumbler-owned grid semantics;
- a purpose-built two-dimensional virtualizer.

The winning option must let Kryptonote own all markup and visuals, handle large
sparse sheets, and avoid forcing workbook state into a row-object abstraction.

ExcelJS is useful as a generator, parser comparison, and fixture source. It is
not assumed to satisfy loss-preserving editing requirements.

## Presentations

### Initial vertical slices

- Open presentation metadata and slide order.
- Resolve slide, layout, master, and theme relationships.
- Render a slide scene with basic shapes and text.
- Select, move, resize, and edit simple shapes.
- Preserve notes, unsupported shapes, transitions, and extensions.
- Save and reopen without a repair.

### Progressive capabilities

- More complete DrawingML geometry.
- Text layout, autofit, bullets, and rich runs.
- Groups, connectors, images, crop, fills, lines, and effects.
- Tables and charts.
- Guides, snapping, alignment, ordering, and grouping interactions.
- Notes and comments.
- Transitions and animations, initially recognized and preserved.
- Embedded media and objects, initially inert and preserved.

SVG is the likely primary slide renderer because it matches the scene-graph
nature of presentations and gives us DOM accessibility and hit testing. Text
editing may use HTML overlays when browser editing behavior is preferable.

PptxGenJS and other presentation generators are useful fixture producers, not
the editor architecture.

## First-party Svelte head

The Svelte head is not a generic office-themed component library. It is the
reference integration demonstrating that the headless packages are sufficient
to build a complete editor.

It should expose replaceable layers such as:

```text
Document surface
├── content renderer
├── selection and caret overlay
├── interaction controller
├── rulers, headers, or sheet chrome
├── context UI supplied by the host
└── diagnostics and unsupported-feature affordances
```

Tumbler should supply interaction primitives without forcing visible controls.
The host decides whether formatting appears in a toolbar, contextual panel,
command palette, assistant action, or nowhere.

## Client-side requirements

- No server is required to preview or edit a supported file.
- Opening can begin from an `ArrayBuffer`, `Blob`, stream-like source, or host
  adapter.
- Saving can produce bytes or stream them to a host adapter.
- Expensive parsing and layout should be movable into workers.
- The UI should appear immediately with progressive detail where possible.
- Unsupported features should degrade locally rather than blanking the entire
  document.
- Fonts and substituted fonts must be observable because they affect fidelity.
- Clipboard behavior must support internal rich data and useful external plain or
  HTML representations without trusting pasted markup.

## Candidate libraries

These are evaluation candidates, not settled dependencies:

| Need | Candidates or direction | Evaluation concern |
| --- | --- | --- |
| ZIP/deflate | `fflate` or a small compatible abstraction | Browser speed, streaming, raw-entry preservation |
| XML parsing | SAX/token parser plus Tumbler loss-aware tree | Unknown markup preservation, source locations, memory |
| XML validation | Generated metadata plus external validators | Bundle size; validation may remain test-only |
| Grid state/UI | TanStack Table and TanStack Virtual prototypes | Spreadsheet semantics and 2D virtualization |
| Property testing | `fast-check` | Shrinking quality and deterministic seeds |
| UI integration | Svelte | Complete host ownership and incremental rendering |
| Visual tests | Playwright | Stable fonts, geometry assertions, screenshot noise |

We should prefer small, well-bounded dependencies. ZIP compression and
virtualization are reasonable places to reuse mature work. The loss-aware OOXML
model, editing semantics, preservation logic, and public API are the core value
of Tumbler and should remain ours.
