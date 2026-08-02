# Roadmap

This roadmap defines order and exit criteria, not dates. Tumbler deliberately
builds one format at a time while keeping the family architecture intact.

## Phase 0: foundations and experiments

- Establish the private monorepo and package dependency rules.
- Select a ZIP implementation through preservation and browser benchmarks.
- Prototype a loss-aware XML parser representation.
- Define diagnostic and capability-reporting conventions.
- Define fixture metadata and standards requirement manifests.
- Build a thin Open XML SDK validation command for tests.
- Collect a small, legally reviewed corpus for all three formats.
- Prototype browser worker boundaries.

Exit when a package can be inventoried and validated without format-specific
code, unknown bytes are retained, and failures are typed and bounded.

## Phase 1: OPC vertical slice

- [x] Read a bounded classic-ZIP central directory and parts.
- [x] Parse content types and relationships from bounded infrastructure XML.
- [x] Resolve internal targets safely and retain external targets without fetching.
- [x] Discover Word, spreadsheet, and presentation main parts through relationships.
- [x] Track replaced, added, removed, and relationship-edited parts in an atomic package transaction.
- [x] Write a byte-identical no-op save and preserve untouched compressed payloads on replacement.
- [x] Reject archive bombs, unsafe paths, duplicate logical names, and invalid relationship targets.
- [x] Add deterministic property tests and byte-level mutation tests for the first slice.
- [ ] Add licensed real-producer fixtures and external Open XML SDK/LibreOffice validation.
- [x] Add/remove parts while updating content types and relationship graphs transactionally.

Exit when representative DOCX, XLSX, and PPTX packages survive no-op round trips
and validation, including packages with unknown and embedded parts.

## Phase 2: shared OOXML vertical slice

- [x] Parse namespace-aware XML without losing prefixes, lexical ordering, or unknown markup.
- [x] Apply atomic source-range edits and reparse before commit.
- [x] Implement an initial read-only markup-compatibility traversal.
- [x] Identify the shared Strict and Transitional vocabulary namespaces.
- [x] Establish source-span preservation anchors.
- [x] Prove a typed Core Properties edit across DOCX, XLSX, and PPTX.
- [ ] Complete application-configured MCE processing for format vocabularies.
- [ ] Add real-producer fixtures and external consumer validation.
- Add common measurements, colors, themes, and DrawingML only as demanded by the
  first format.
- Generate useful schema metadata without shipping an enormous runtime validator.

The known-subtree preservation exit condition is met for Core Properties.
Phase 2 remains open for full MCE qualification and the shared primitives
demanded by the first visible format.

## Phase 3: headless editing core

- Define revisions, snapshots, commands, transactions, and diagnostics.
- Add undo and redo.
- Define selection and capability primitives.
- Emit narrow, deterministic change events.
- Support cancellation and external revision replacement.
- Prove behavior with generated command histories.

Exit when a toy format adapter can drive editing and history without a DOM or UI
framework.

## Phase 4: first format

SpreadsheetML is the selected first format. The first bounded vertical slice is
now implemented:

- [x] discover ordered worksheet parts through Strict or Transitional relationships;
- [x] parse sparse scalar cells, formulas with cached values, and shared/inline rich text;
- [x] parse dimensions, merges, panes, and basic row/column layout;
- [x] select and navigate the grid without DOM state;
- [x] edit literal string, number, and boolean values and clear cells;
- [x] save only changed worksheet parts and reopen the result;
- [x] render an owned, virtualized Svelte grid with edit callbacks;
- [x] compute the first cell-style and number-format display projection;
- [x] resolve opaque RGB, theme, indexed, and tinted cell-style colors;
- [x] render variable geometry, ordinary merges, and frozen pane regions;
- [x] recognize table parts and project read-only table sorting/filtering in the owned grid;
- [x] parse and calculate a bounded first formula slice into read-only value overlays;
- [ ] edit formulas and structural ranges safely;
- [ ] pass Open XML SDK, LibreOffice, and Microsoft Excel round trips.

The remaining format order still follows deliberate value and evidence, not
visual familiarity alone.

Selection criteria:

- immediate Kryptonote user value;
- difficulty and uncertainty of faithful layout;
- strength of available test corpora and external oracles;
- usefulness in proving shared OPC, OOXML, editing, and Svelte boundaries;
- ability to ship a coherent narrow capability rather than a broad demo.

Take the chosen format through:

1. parse and preserve;
2. headless semantic model;
3. read-only native rendering;
4. selection and navigation;
5. one useful edit family;
6. save and consumer round trip;
7. visual, fuzz, property, and performance qualification.

## Phase 5: first production Svelte head

- Integrate the first format into Kryptonote's file preview surface.
- Keep all visible controls in Kryptonote's design language.
- Support immediate shell rendering and progressive document work.
- Handle agent-produced file revisions.
- Add unsupported-feature diagnostics without technical clutter.
- Measure opening, viewport, command, and save performance on real documents.

Exit when preview and the supported edits feel native, survive external file
replacement, and do not depend on a hosted or converted representation.

## Phase 6: deepen the first format

Expand feature families based on real documents and failures. Every feature must
advance through recognized, preserved, rendered, editable, and interoperable
states rather than landing as an unqualified checkbox.

## Phase 7: second and third formats

Repeat the same vertical-slice discipline. Shared improvements flow downward
into OPC, OOXML, core, and testkit. Format-specific compromises do not leak
sideways into the other format models.

The second format is a deliberate architecture test: if it requires bypassing
the shared layers, revisit the abstraction rather than cloning the first
implementation.

## Phase 8: OSS stabilization

The source is public early so design and testing can happen in the open. Public
source is not a claim of stability. Before recommending external adoption:

- [x] choose a source license;
- [x] publish explicit early-alpha and security policies;
- audit dependency and fixture licensing;
- stabilize package boundaries and names;
- separate Kryptonote-specific UI from reusable Svelte heads;
- publish capability and conformance reports;
- document extension points and unsupported-feature behavior;
- establish security reporting and release processes;
- reserve package and repository names.

The headless engine and testkit are the primary OSS contribution. The Svelte
head demonstrates complete UI ownership without making Svelte mandatory.
