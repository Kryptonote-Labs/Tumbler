# PowerPoint standards baseline and original implementation plan

Research date: 2026-09-21. This document records the original scope and sequencing.
Its proposed restrictions and deferred features are historical, not the current
capability list. See [PresentationML implementation](presentationml-implementation.md)
for current support and [the PowerPoint guide](https://tumbler.alexco.dev/docs/powerpoint)
for integration examples.

## Recommendation

Build a native PPTX viewer with a bounded first editing path: open a deck, navigate slides, render inherited appearance, edit ordinary text, move or resize supported slide-local objects, undo, and export without rewriting unrelated content. Deliver this through Tumbler's packages and the standalone docs playground.

The first engineering checkpoint is a read-only inheritance fixture: a slide whose title geometry, background, and typography come from its layout, master, and theme. It should render correctly before we add editing controls. A renderer that only reads objects physically present in slide XML will not meet this milestone.

## Standards to use

Use the standard for the format contract, Microsoft implementation notes for PowerPoint behavior, and real applications as compatibility checks. Record which source a requirement comes from; a producer quirk is not a universal OOXML rule.

| Source | Relevant scope | How we will use it |
| --- | --- | --- |
| [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/), Part 1, 5th edition, December 2016 | §13 PresentationML packaging; §19 presentation markup; §§14–15 related/shared parts; §§20–21 DrawingML | Main schema and semantic baseline. Use the supplied schemas and preset-geometry definitions when implementing individual features. |
| ECMA-376 Part 2, 5th edition, December 2021 | Open Packaging Conventions | Reuse Tumbler's package, relationship, content-type, and transaction machinery. |
| ECMA-376 Part 3, 5th edition, December 2015 | Markup Compatibility and Extensibility | Resolve the supported view while retaining original alternatives and extension markup. |
| ECMA-376 Part 4, 5th edition, December 2016 | Transitional migration features | Distinguish Strict and Transitional vocabularies and retain the input dialect when writing. |
| [MS-OI29500 / MS-OE376, via Microsoft's standards index](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-offstandlp/d5784a8b-7070-466b-befa-b7bf3724c6f0) | Office implementation behavior and differences from the base standards | Consult alongside each implemented element, especially placeholder inheritance, text, and defaults. Use MS-OI29500 for the modern ISO baseline; consult MS-OE376 for older ECMA behavior when a fixture requires it. |
| [MS-PPTX](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/efd8bb2d-d888-4e2e-af25-cad476730c9f), published revision 25.0, 2024-08-20 | PowerPoint extensions | Identify and preserve modern presentation extensions. Implement individual extensions only when the supported fixture set requires them. |
| [MS-ODRAWXML](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/06cff208-c6e1-4db7-bb68-665135e5f0de), published revision 34.0, 2026-02-17 | Shared Office drawing extensions | Resolve supported picture/drawing representations and preserve other extension data. |
| [MS-OEXTXML](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oextxml/90b058e9-5539-46d0-9796-8910bfe248a3), published revision 5.0, 2024-08-20 | Shared extension-list structures | Retain extension payloads through targeted edits. |
| [MS-PPT](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt/6be79dde-33c1-4c1b-8ccc-4b2301c08662) | Legacy binary `.ppt` | A separate format, outside this milestone. Do not treat it as zipped PresentationML. |
| [MS-OFFCRYPTO](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-offcrypto/3c34d72a-1a61-4b52-a893-196f9157f083) | Encrypted Office documents | Recognize unsupported encrypted input; decryption is a separate project. |

The four ECMA parts have different publication dates. Do not label all of them “2021.” The existing ignored reference archive contains searchable ECMA text, schemas, and Microsoft specifications. Its MS-OI29500 copy identifies itself as released 2026-05-19. That is a local source pin, not an assertion that every online subpage has the same revision. Record the document checksum and relevant clause with new fixture requirements. Keep complete source publications in the ignored archive; commit our own notes and licensed fixtures only.

[Microsoft's structure guide](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document) is a useful orientation to separate presentation, slide, layout, master, and theme parts. It is not a substitute for normative cardinality and relationship rules.

## Starting point at the research audit

Before this implementation:

- `packages/slides/src/index.ts` is empty; `@tumblerjs/slides` is private at `0.0.0`.
- `opc` supplies bounded package reading, relationships, office-document discovery, transactions, and no-op preservation.
- `ooxml` supplies lossless XML, namespace definitions, an MCE view, and theme colour/font readers. These are reusable foundations, not a complete slide style resolver.
- `core` supplies editing history and formatting contracts.
- `charts` and `svelte/OoxmlChart.svelte` supply chart models and native rendering. Connect them through slide graphic frames rather than creating another chart engine.
- `testkit` already has fixture provenance and capability/requirement structures. Add presentation requirements there.
- `tools/openxml-validator/Program.cs` currently opens only `SpreadsheetDocument`. The compatibility workflow only generates XLSX fixtures and installs LibreOffice Calc.
- Neither `dotnet` nor `libreoffice` was found on this shell's PATH during this audit. CI already installs validation dependencies; extend that setup for presentations rather than claiming local external validation.
- The docs playground and Components page provide a standalone integration target. No Kryptonote application changes are needed for this milestone.

## Design decisions

### Keep source, resolved appearance, and interaction separate

Proposed flow:

```text
PPTX bytes → OPC package → lossless slide/layout/master/theme sources
                              ↓
                     resolved slide scene
                              ↓
                Svelte SVG view + HTML text editor
                              ↓
                   narrow headless commands
                              ↓
                  changed XML part → PPTX bytes
```

The resolved scene needs object identity, source part/element ownership, geometry, text, stacking order, resource references, and feature diagnostics. Keep authored theme expressions and inherited values separately from computed colours, fonts, and coordinates. Selecting an inherited master decoration must not make it an editable slide-local shape.

Proposed public boundaries, subject to implementation review:

- `openPresentationArtifact(bytes)` and immutable `PresentationArtifact` in `@tumblerjs/slides`.
- `layoutPresentationSlide(...)` returning a renderer-independent scene with a pluggable text measurer.
- `PresentationEditingSession` using core history; stable identity based on slide part plus shape ID, never an ephemeral DOM node or parser index alone.
- `PresentationSlideView` in `@tumblerjs/svelte`, responsible for one slide, zoom, selection, and edit callbacks.
- Deck navigation, thumbnails, uploads, reset, download, and surrounding toolbar composition in the docs host.

Add direct `opc` and `charts` dependencies to Slides when used. Share generic DrawingML functions through `ooxml` where needed; do not import Word's layout engine or spreadsheet placement rules. Keep Slides private until its package/release qualification is ready. Publishing it will require updating the current fixed eight-package release and qualification lists.

### Treat inheritance as a resolver, not a blanket object merge

The display follows slide/layout/master/theme relationships, but different properties have different lookup rules. Resolve backgrounds, master-shape visibility, placeholder transforms, colour maps, theme style references, list levels, and text defaults separately.

One concrete rule: PowerPoint matches a slide placeholder to its layout placeholder by `idx`; matching everything by shape name or placeholder type is wrong. Notes have a different matching rule. See [MS-OI29500 §2.1.1127](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/3ec954b2-37a6-41da-8973-04a592c91fb2). Layout-to-master matching and special title/body roles need their own fixtures before implementing the full resolver.

Do not render layout placeholder prompt text as slide content. Retain empty slide placeholders and distinguish them from absent placeholders. Honour visibility flags and hidden-slide state rather than inferring visibility from the existence of text.

### Preserve unsupported content deliberately

Use MCE to choose a renderable representation without deleting other branches. Microsoft's [MCE guidance](https://learn.microsoft.com/en-us/office/open-xml/general/introduction-to-markup-compatibility) explains that destructive preprocessing changes what survives a save. Keep raw markup beside the supported semantic view.

Unsupported shapes, media, diagrams, effects, notes, comments, timing, and extension parts stay in the package. Report affected slide/object identities and whether the limitation concerns rendering or editing. Show a bounded fallback when reliable bounds exist; otherwise use a slide-level diagnostic. Never invent a plausible-looking replacement and claim fidelity.

A shape with an unsupported alternate representation or unknown references should not become editable merely because its bounding rectangle is known. Block operations whose impact cannot be preserved. No-op export must remain byte-identical. Signed packages should be preservation-only in the first editor; do not emit invalidated signatures as if still valid.

## First milestone scope

| Area | Included | Deferred or explicitly limited |
| --- | --- | --- |
| Files | Unencrypted `.pptx`, Strict and Transitional namespaces; ordered slides, dimensions, hidden flags | Binary PPT, encrypted files, macro-enabled/template/slideshow editing |
| Structure | Slide → layout → master → theme relationships; source ownership; bounded traversal and caches | Slide creation, duplication, deletion, reordering, cross-deck copy |
| Appearance | Solid backgrounds/fills, basic strokes, theme colours/fonts and supported style references, master decorations | Broad effects engine, 3D, arbitrary custom geometry |
| Geometry | Rectangles, ellipses, lines, a small declared preset set; rotation/flips and nested group transforms for rendering | General guide-expression engine, adjustment-handle editing, connector rerouting |
| Text | Ordinary horizontal text, runs, paragraphs, common bullets, margins, alignment, vertical anchoring, wrapping; explicit handling of the supported autofit cases | Full typography parity, WordArt, vertical writing, equations, unrestricted multilingual/font fidelity |
| Pictures | Embedded browser-decodable images, crop/stretch, rotation/flips and clipping | Remote fetching, EMF/WMF conversion, arbitrary SVG processing without an audited resource policy |
| Charts | Existing supported chart kinds using cached data and the shared renderer | Chart-data editing, embedded-workbook editing, newer unsupported chart families |
| Tables/SmartArt/media | Identify, preserve, and provide an honest fallback or diagnostics | Native table/SmartArt editing and media playback |
| Editing | Single-object selection; move/resize ordinary ungrouped slide-local shapes and pictures; edit ordinary text; undo/redo/export | Group/rotated-object editing handles, master editing, object insertion/deletion, z-order commands, animation editing |
| UI | Slide navigation, bounded thumbnails, zoom/pinch, reset/download, per-slide capability feedback | Presenter mode, slideshow transitions, collaboration |

These are proposed scope boundaries, not supported-feature claims. Rendered, editable, and preserved are separate capability states. An unsupported text mode must not silently switch to ordinary horizontal text and then become editable.

For text, start with pinned fonts and an injectable browser measurer. Preserve original text runs and paragraph properties during edits. Treat `noAutofit`, `normAutofit`, and `spAutoFit` as distinct modes; support and test a mode before allowing edits that depend on it. Missing-font diagnostics should explain possible line-wrap differences without claiming pixel parity.

Store source transforms in EMUs and source angle units; convert only for rendering. Compose nested groups with affine matrices and inverse hit testing. A view zoom must never become a document transform. The first move/resize command family should reject unsupported grouped/rotated targets with a capability reason while leaving their rendering intact.

## Implementation sequence and exit checks

1. **Fixtures and preservation boundary.** Add presentation requirements, a small valid fixture builder, package discovery, ordered slides, and typed errors. Include unusual valid part paths, Strict/Transitional files, malformed relationships, empty decks, and resource-limit cases. Exit: no-op bytes are identical and bad input fails without unbounded work.
2. **Inheritance and scene model.** Implement source-aware slide/layout/master/theme resolution, placeholders, background/colour/style lookup, transforms, and shape stacking. Exit: inherited title, master-logo, colour-map override, and nested-transform fixtures produce the expected scene. Establish Microsoft-specific matching rules with evidence here.
3. **Native read-only viewer.** Render the declared shapes, pictures, text, and shared charts. Add navigation and zoom in the docs playground, plus a single-slide Components example. Exit: reference decks render with explicit diagnostics for unsupported content; viewport changes do not distort aspect ratio or mutate document geometry.
4. **Safe edit commands.** Add text replacement and move/resize with one history entry per gesture. A drag previews locally, then commits on release; Escape cancels. Exit: undo restores the original revision; export changes only the owning supported XML fields; other slide/master/theme/media/notes/timing parts remain unchanged. Preserve identities and inherited formatting.
5. **Compatibility qualification.** Extend the validator to `PresentationDocument`, add Impress CI and a documented desktop PowerPoint check, then publish a capability matrix backed by fixture results. Exit: no new validator errors, no repair prompt in the tested PowerPoint version, and no unexplained changes in the supported visual corpus after reopening.

Step 1 is the first commit-sized work. Steps 1–5 together are the first big product milestone. Do not postpone inheritance until after the visual demo; it determines the model and edit ownership.

## Evidence required before release

Use independently authored fixtures alongside generated ones. Record producer/version, origin, redistribution permission, fonts, source clauses, expected result, and supported/unsupported features. Request a small non-confidential PowerPoint-authored deck and reference screenshots when we reach consumer validation; access to desktop PowerPoint remains an external dependency.

Minimum focused fixture set:

- An inherited title/body deck with layout placeholders, theme fonts, a master logo, and explicit overrides.
- 4:3 and 16:9 decks, non-default slide size, slide order different from filename order, and hidden slides.
- Nested groups with scale/rotation/flips, plus unsupported edit targets that remain unchanged.
- Mixed text runs, empty placeholders, bullets, wrapping, spacing, and distinct autofit modes.
- Cropped pictures and supported charts, including their unchanged related assets after text edits.
- Unknown extensions, alternate-content branches, notes/comments, timing references, and unsupported objects coexisting with an editable shape.
- Missing fonts, broken relationships, malicious external targets, excessive nesting, and signed/encrypted input policies.

Validation has separate responsibilities:

- Unit/property tests: transform composition and inverses, inheritance precedence, identity stability, bounded parsing, edit/undo invariants.
- Package comparisons: untouched parts and unknown branches remain byte-identical; targeted edits preserve unrelated markup. Reopen with Tumbler as an internal consistency check, not the only oracle.
- [Open XML SDK validator](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.validation.openxmlvalidator): pin SDK and target Office version, baseline original-file errors, and reject errors introduced by edits. Account for Strict namespace mapping in the SDK; do not use its rewritten output as proof of lexical preservation.
- LibreOffice Impress: automated open/export/reopen and rendered reference checks. Differences are investigated, not automatically treated as PowerPoint truth.
- Microsoft PowerPoint: open and save edited fixtures without repair, compare slides with known fonts, and verify unsupported features survived. Record the actual application build.
- Headless Playwright: pointer selection, drag/resize at multiple zoom levels, keyboard movement where supported, Escape, undo/redo, text entry/IME, navigation, and export/reopen.
- Performance: record first-slide time, peak memory, and zoom/drag frame timings on a fixed reference device and a larger deck. Mount the active slide and a bounded thumbnail window, cache shared masters/themes, and avoid reparsing or serializing on every pointer move. Set numerical budgets after the first measured prototype.

## Remaining decisions to resolve during the first checkpoint

- Confirm layout-to-master placeholder matching and special-role fallback with pinned normative/implementation clauses and actual PowerPoint output.
- Choose the initial font set and make unsupported typography visible in capability reporting.
- Decide whether basic native table rendering belongs in the next milestone after seeing the first representative decks. It should not delay package preservation or core inheritance work.
- Confirm access to a desktop PowerPoint validation environment. Until that evidence exists, describe results as schema/Impress/browser tested, not fully PowerPoint-qualified.

No implementation, dependency, release, or deployment changes are part of this research document.


## DrawingML coverage added in the second slice

The geometry evaluator uses the ECMA geometry supplement for 186 distinct presets, authored adjustment guides, and custom paths. It handles quadratic/cubic curves and elliptical arcs, bounds input complexity, and rejects non-finite results. Tests exercise every preset at four aspect ratios. The source supplement contains malformed circular-arrow formulas with an extra operand; the generation script records and corrects those expressions.

The reader resolves ordered HSL/RGB/alpha transforms, linear and circular gradients, ordinary outer shadows, dashed strokes, and line-end markers. All 74 built-in Office table style definitions come from MS-OE376 section 2.1.1343. Authored styles take precedence; cell formatting overrides table formatting. Headers, banding, corner regions, and theme colours feed the reusable table renderer.

Text includes common Arabic/alphabetic/Roman numbering, bullet colour/size, baseline offsets, strike-through, character spacing, capitals, fixed line spacing, hyperlinks, and speaker notes. Internal hyperlinks navigate through a host callback. External hyperlink protocols are restricted to HTTP, HTTPS, mailto, and tel. No external images or relationships are fetched.

The `standards-features.pptx` fixture and the corresponding playground example exercise these additions. This is rendering coverage, not a declaration of complete ECMA conformance. Browser layout is approximate for vertical/multi-column text, shape fill lightening/darkening, transformed shadows, and complex typography. Pattern fills, 3D effects, SmartArt, media playback, animations, and table row/column operations remain outside the supported slice. PowerPoint and Impress application validation is still outstanding.


## Current editing coverage

The initial scope has expanded to rich-text and table-cell editing, formatting,
rotation, grouped children, inherited placeholder geometry, and preserved Office
extension data. The [implementation notes](presentationml-implementation.md)
describe remaining restrictions and validation commands.
