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

- Read ZIP central directory and parts.
- Parse content types and relationships.
- Resolve internal and external targets safely.
- Track clean and dirty parts.
- Write a no-op round trip with untouched-entry preservation.
- Reject archive bombs and invalid paths.
- Add property generators, mutation fuzzing, and standards-linked tests.

Exit when representative DOCX, XLSX, and PPTX packages survive no-op round trips
and validation, including packages with unknown and embedded parts.

## Phase 2: shared OOXML vertical slice

- Parse namespaces without losing prefixes or unknown markup.
- Implement markup-compatibility traversal.
- Represent Strict and Transitional forms.
- Establish preservation anchors.
- Add common measurements, colors, themes, and DrawingML only as demanded by the
  first format.
- Generate useful schema metadata without shipping an enormous runtime validator.

Exit when a known subtree can be edited and rewritten while unknown neighbors
remain intact.

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

Choose the first format deliberately; do not default to spreadsheets merely
because their grid is visually familiar.

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

## Phase 8: OSS preparation

Only after the API and preservation model have substantial evidence:

- choose license and governance;
- audit dependency and fixture licensing;
- stabilize package boundaries and names;
- separate Kryptonote-specific UI from reusable Svelte heads;
- publish capability and conformance reports;
- document extension points and unsupported-feature behavior;
- establish security reporting and release processes;
- reserve package and repository names.

The headless engine and testkit are the primary OSS contribution. The Svelte
head demonstrates complete UI ownership without making Svelte mandatory.
