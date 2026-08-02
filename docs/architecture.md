# Architecture

## Dependency direction

```text
Application shell
      ↓
Svelte heads
      ↓
Word / Sheets / Slides
      ↓
Headless editing core
      ↓
Shared OOXML
      ↓
Open Packaging Conventions

Testkit observes and attacks every layer.
```

Dependencies point inward. OPC and OOXML must never depend on document formats,
the headless core must never depend on Svelte, and format packages must not
import one another.

## Package responsibilities

### `@tumbler/opc`

Owns the physical OOXML package as a graph of parts and relationships:

- ZIP parsing and writing;
- raw part bytes and metadata;
- `[Content_Types].xml` defaults and overrides;
- package-level and part-level relationships;
- internal and external relationship targets;
- normalized package paths and URI resolution;
- lazy loading and streaming boundaries where practical;
- dirty-part tracking;
- preservation of untouched ZIP entries;
- resource limits and hostile-package rejection.

It does not know what a paragraph, cell, shape, or slide is.

### `@tumbler/ooxml`

Owns behavior shared by the three OOXML vocabularies:

- namespaces and qualified names;
- Strict and Transitional namespace handling;
- markup compatibility and `mc:AlternateContent`;
- schema-derived metadata;
- common simple types, measurements, colors, dates, and IDs;
- DrawingML primitives shared by documents, sheets, and slides;
- theme, font, fill, line, and color resolution where genuinely shared;
- loss-aware XML representation;
- preservation anchors for unknown elements, attributes, and extensions.

This layer should be schema-informed, but generated schema types must not be
allowed to dictate the public editing API.

### `@tumbler/core`

Owns format-neutral editing machinery:

- immutable or safely versioned snapshots;
- commands and transactions;
- undo and redo;
- selection primitives and focus state;
- change events and subscriptions;
- document revision identity;
- dirty state;
- command batching;
- cancellation;
- diagnostics and capability reporting;
- hooks for external revision replacement or reconciliation.

It contains no WordprocessingML, SpreadsheetML, PresentationML, XML, or UI
framework behavior.

The core should describe actions in user-domain language, such as inserting a
row or applying text emphasis. Raw XML operations remain below the editing API.

### `@tumbler/word`

Owns WordprocessingML parsing, editing semantics, layout inputs, and writing.
Its model must retain the distinction between document structure, style
inheritance, numbering, sections, headers, footers, notes, fields, drawings,
comments, and relationships.

### `@tumbler/sheets`

Owns SpreadsheetML parsing, workbook and worksheet state, cell values and
formats, formulas and references, tables, names, drawings, layout inputs, and
writing.

The spreadsheet package owns spreadsheet semantics. A table/grid UI library may
help render it, but must not become the workbook model.

### `@tumbler/slides`

Owns PresentationML parsing, slide ordering, masters and layouts, shapes, text,
connectors, notes, themes, animations where supported, layout inputs, and
writing.

### `@tumbler/svelte`

Owns first-party Svelte rendering and interaction:

- document surfaces;
- viewport virtualization;
- selection, caret, handles, guides, and overlays;
- keyboard, pointer, clipboard, and drag interactions;
- accessibility mappings;
- opt-in default components;
- adapters between Svelte state and headless commands.

Applications can use the complete head, replace individual components, or build
another head directly against format packages.

If the heads become large, this workspace can later split into
`svelte-word`, `svelte-sheets`, and `svelte-slides`. There is no need to make
that split before real code demands it.

### `@tumbler/testkit`

Owns reusable quality infrastructure:

- conformance requirement manifests;
- fixture manifests and provenance;
- package and XML validators;
- byte, part, subtree, and semantic diffs;
- model and command generators;
- fuzzing harnesses and minimized seeds;
- external consumer adapters;
- visual fixture definitions;
- compatibility and coverage reports.

## Internal representations

One representation is not enough. The planned pipeline has three related views:

```text
Raw package graph
  exact parts, bytes, relationships, unknown content
                ↓
Loss-aware format tree
  known structures plus preservation anchors
                ↓
Editing model
  ergonomic state and commands for supported behavior
```

The raw package graph protects fidelity. The format tree connects editing
semantics to source markup. The editing model gives UI consumers a usable API.

Serializing must update only the affected format nodes and package parts. A
generic "model to brand-new document" writer is useful for document generation,
but cannot be the only save path for an editor because it would discard content
outside the model.

## Editing and change propagation

Commands are the mutation boundary:

```text
UI intent → typed command → validated transaction → new state/revision → event
```

A command should expose enough information for:

- undo and redo;
- focused serialization;
- semantic change inspection;
- collaboration or command replay later;
- deterministic property testing;
- UI updates without reparsing the entire document.

The initial implementation need not be collaborative, but commands should not be
designed in a way that makes future external revision handling impossible.

## Rendering and layout

Tumbler renders native client-side components. The UI may use DOM, SVG, Canvas,
or a combination chosen per surface:

- Word likely combines DOM text/editing behavior with explicit page and layout
  calculation.
- Sheets likely uses a virtualized grid with DOM overlays and potentially Canvas
  for dense backgrounds or decorations.
- Slides naturally map much of their scene graph to SVG, with DOM editing
  overlays where browser text behavior is valuable.

The headless model must not expose renderer-specific nodes. Layout results may be
shared as typed geometry and hit-test data.

Rendering should be incremental. Opening a large file must not require mounting
every page, row, cell, or slide. Parsing, layout, and expensive recalculation
should be cancellable and eligible for Web Workers.

## Preservation contract

Each loaded node and package part needs enough provenance to answer:

- Was it parsed and understood?
- Was it edited?
- Which source XML or bytes own it?
- Which unknown siblings, attributes, or extensions surround it?
- Which relationships and resources does it reference?

The desired no-op save is byte-identical. Where ZIP metadata or canonicalization
makes that impractical, untouched entries must remain byte-identical and changed
parts must remain semantically equivalent outside the intended edit.

## Security boundary

Office files are untrusted archives and XML documents. The package layer must
enforce:

- compressed and expanded size limits;
- entry count and nesting limits;
- path traversal prevention;
- safe URI handling;
- XML entity and expansion protection;
- bounded parsing and layout work;
- explicit treatment of external relationships;
- preservation without execution of macros or embedded active content.

Potentially active content should be surfaced as a capability or warning, not
silently run.
