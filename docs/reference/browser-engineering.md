# Browser architecture and layout

## Client-side boundary

Tumbler previews and edits OOXML in the browser. The normal runtime path is:

```text
Blob / ArrayBuffer / host byte source
        ↓
OPC inventory and bounded inflation
        ↓
loss-aware XML and format adapters
        ↓
headless editing state
        ↓
incremental layout and Svelte rendering
        ↓
focused serialization to bytes
```

No document conversion service or hosted office frame is required.

## Worker partitioning

Good worker candidates:

- ZIP inventory and inflation;
- XML tokenization and indexing;
- schema/structural validation;
- formula parsing and dependency calculation;
- expensive pagination or shape-path generation;
- serialization and compression;
- corpus/diagnostic analysis.

DOM measurement, focus, clipboard interaction, selection overlays, and final
paint coordination stay on the main thread.

Cross-worker messages need versioned, typed payloads and transferable buffers.
Avoid copying whole documents after every edit. Every asynchronous result carries
the source revision so stale work can be discarded.

## Progressive opening

The UI should show useful state as early as safety allows:

1. identify the package and document category;
2. show document shell and metadata;
3. parse the first visible page/sheet/slide;
4. render visible content;
5. continue indexing and validation in the background;
6. surface diagnostics only where relevant.

Immediate does not mean pretending a document is ready. Commands requiring an
unparsed region can await or trigger that region while navigation remains
responsive.

## Rendering technologies

### DOM

Strengths:

- native text shaping and selection primitives;
- accessibility tree integration;
- familiar focus, input, and clipboard behavior;
- straightforward Svelte composition.

Risks:

- large node counts;
- browser layout behavior diverging from Office;
- `contenteditable` mutation unpredictability;
- difficult 2D virtualization and exact pagination.

### SVG

Strengths:

- vector scene graph;
- transforms, clipping, and hit-testable objects;
- strong match for slide geometry;
- accessible DOM nodes and stable snapshots.

Risks:

- text layout differences;
- large scene performance;
- editing text usually needs an overlay;
- filters/effects can be expensive or differ from Office.

### Canvas

Strengths:

- dense predictable drawing;
- lower persistent node count;
- efficient custom grid/background painting.

Risks:

- accessibility and hit testing must be built;
- text editing requires overlays;
- semantic visual tests are harder;
- full repaint logic can become complex.

Use a mixed renderer per format. The headless models expose geometry and semantic
identity, not DOM/SVG/Canvas nodes.

## Input and editing

Browser-native editing should be treated as an input source, not the canonical
document model. A practical text path is:

```text
beforeinput / composition / keyboard / paste
        ↓
normalize to Tumbler command
        ↓
apply transaction to headless state
        ↓
rerender and restore mapped selection
```

Requirements:

- IME composition support;
- grapheme-safe movement and deletion;
- bidirectional selection;
- screen-reader-compatible focus;
- deterministic undo owned by Tumbler rather than browser history;
- sanitized HTML/plain-text paste adapters;
- copy formats appropriate to each Office surface;
- no reliance on keydown alone for text input.

## Virtualization

Each format has a different unit:

- Word: pages, blocks, lines, and floating objects;
- Sheets: independent row and column windows plus frozen regions;
- Slides: slide thumbnails and one/few active scenes.

Virtualization must preserve logical selection and command behavior outside the
mounted region. DOM presence cannot define model existence.

Maintain stable anchors when estimates become measured sizes. Scrolling should
not jump as pages, rows, images, or fonts finish resolving.

## Font handling

Fonts affect line breaks, pagination, cell text clipping, shape text autofit,
charts, and visual regression.

Track:

- requested family and theme source;
- resolved browser font;
- substitution/fallback;
- load state;
- script-specific fallback;
- metrics version used for layout.

Font load completion can invalidate layout. Batch and version recalculation.
Test in a pinned font environment and keep substitution scenarios in the corpus.
Embedding or extracting document fonts needs separate licensing and security
review.

## Svelte head contract

The Svelte package should consume stores/signals or subscriptions exposed by the
headless engine without making Svelte state the document state.

Likely surfaces:

- viewport component;
- content-layer components;
- selection and interaction layer;
- host slots/snippets for context UI;
- accessibility mirror where Canvas is used;
- diagnostics events;
- imperative focus/scroll-to APIs.

Visible controls remain host-owned. Avoid adding labels, status copy, or toolbars
that an application must fight to remove.

## External file revisions

When an agent changes a workspace file, the host supplies a new revision. Cases:

- local state clean: replace and rerender;
- local state dirty but source unchanged: save local revision normally;
- local and external changes: invoke explicit conflict policy.

Future reconciliation could compare OPC parts and replay commands against a new
base. The initial safe policy can prompt/reload, but revision IDs and command
logs should leave room for better merging.

## Performance budgets to establish

- time to package identity;
- time to first visible content;
- input-to-paint latency;
- scroll frame stability;
- layout work per viewport change;
- bytes transferred between workers;
- peak memory during open/save;
- retained memory after close;
- cancellation latency;
- save time and output size.

Measure representative documents before fixing numeric budgets in policy.
