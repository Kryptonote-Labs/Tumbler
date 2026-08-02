# Testing strategy

The objective is not ordinary library coverage. Tumbler must survive malformed
packages, decades of producer quirks, destructive round trips, enormous files,
random editing sequences, and visual comparison with mature Office consumers.

Testing is implemented with each capability rather than after it.

## Running the current suite

From the repository root:

```bash
bun run check
bun test
```

The Phase 1 suite currently covers bounded ZIP inventory and inflation, hostile
archive mutations, OPC part-name and content-type rules, UTF-8/UTF-16
infrastructure XML, relationship resolution, main-part discovery for DOCX/XLSX/
PPTX, byte-identical no-op saves, and exact compressed-payload preservation for
untouched entries. Property tests use fixed framework-reported seeds so a
failure can be replayed and shrunk.

Real-producer and external-validator tests remain a separate next step. Neither
LibreOffice nor a checked-in Office fixture corpus was available in the initial
local environment, so synthetic packages are not presented as interoperability
evidence.

## Testkit structure

The planned shape of `@tumbler/testkit` is:

```text
packages/testkit/
├── src/
│   ├── canonicalizers/
│   ├── corpus/
│   ├── generators/
│   ├── oracles/
│   ├── preservation/
│   ├── requirements/
│   ├── validators/
│   └── visual/
├── standards/
└── upstream-manifests/

fixtures/
├── generated/
├── regressions/
├── fuzz-seeds/
└── private/          # ignored by Git
```

Fixtures need metadata recording producer, producer version, source, format,
features, expected behavior, license, privacy class, and associated issues.

## 1. Unit and focused behavior tests

Use small tests for algorithms and observable behavior:

- relationship resolution;
- content-type matching;
- unit and color conversion;
- style inheritance;
- command application;
- selection movement;
- formula reference transformation;
- shape geometry;
- layout decisions.

Tests should target contracts rather than implementation trivia. Deleting a
feature should make its behavior tests obsolete rather than leave a museum of
meaningless assertions.

## 2. Package and structural validation

Every emitted package is checked for:

- valid ZIP structure;
- legal and normalized part names;
- duplicate paths;
- valid `[Content_Types].xml` entries;
- valid relationship documents;
- resolution of internal targets;
- correct treatment of external targets;
- required parts for the declared document type;
- referenced resources that exist;
- IDs that are unique in the scopes where the format requires it;
- Strict, Transitional, and markup-compatibility behavior;
- XML well-formedness and schema-derived constraints;
- configured archive and XML resource limits.

A small .NET test utility should run Microsoft's
[`OpenXmlValidator`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.validation.openxmlvalidator.validate)
against every generated or edited file. This is a test oracle, not a runtime
dependency.

## 3. Preservation tests

### No-op round trip

```text
input bytes → open → save without edits → output bytes
```

The preferred result is byte identity. At minimum:

- untouched ZIP entries remain byte-identical;
- part order and metadata differences are understood and bounded;
- unknown parts remain present;
- unknown XML remains in the correct location;
- relationships and content types remain complete;
- macros and embedded content remain inert and preserved;
- signatures are detected and their status reported.

### Focused mutation

For a single edit, the harness calculates an allowed change set. For example,
editing one spreadsheet cell may permit changes to its worksheet, shared strings,
and calculation metadata. An unrelated drawing, theme, custom property, or other
worksheet must not change.

Changed XML is compared at byte, token, subtree, and semantic levels so harmless
namespace or attribute-order differences can be distinguished from data loss.

## 4. Semantic round trips

For every supported feature:

```text
bytes → model A → bytes → model B
```

After defined normalization, `A` and `B` must be semantically equal.

Command tests add stronger invariants:

- one command produces exactly its expected semantic diff;
- edit followed by undo restores the base state;
- redo restores the edited state;
- serialization followed by parsing retains command results;
- saving twice is semantically idempotent;
- unrelated commands commute where the domain says they should;
- failed transactions leave no partial state.

## 5. Property-based testing

`fast-check` is the leading TypeScript candidate. Generators should produce both
models and command sequences:

- valid OPC package graphs;
- relationships and content types;
- text runs, paragraphs, styles, and tables;
- workbook, worksheet, cell, merge, and formula structures;
- slides, layouts, shapes, groups, and text;
- unknown extension elements and attributes;
- selections, transactions, and undo/redo histories.

Important properties include:

- `parse(serialize(model))` is equivalent to `model`;
- IDs remain unique;
- internal relationships resolve;
- referenced assets exist;
- commands preserve model invariants;
- undo leaves no residual mutation;
- unknown content remains anchored to the same owner;
- serialization is deterministic for the same input and command history.

Every randomized run records its seed. Failing cases are shrunk to the smallest
reproduction and stored permanently.

## 6. Fuzzing and hostile input

Mutation and generation fuzzers should attack:

- truncated ZIP structures and XML parts;
- duplicate paths and IDs;
- path traversal and odd URI encodings;
- ZIP bombs and extreme compression ratios;
- excessive entry counts and deeply nested XML;
- missing, circular, or surprising relationship graphs;
- namespace substitution and unusual compatibility markup;
- invalid shared-string, style, and sheet indexes;
- extreme cell ranges and drawing coordinates;
- malformed formulas and references;
- invalid encodings and characters;
- huge media, dimensions, style tables, and shared-string tables;
- random edits against partially supported documents.

The required behavior is bounded: return a typed diagnostic or valid document
within time and memory limits. The parser must not crash, hang, traverse outside
the package, execute active content, or emit a silently corrupted save.

Start with deterministic property and mutation fuzzing in Bun. Add
coverage-guided fuzzing when useful targets and stable corpora exist rather than
adding infrastructure for its own sake.

## 7. Differential consumers

Generated and edited files should travel through independent implementations:

```text
Tumbler output
├── Open XML SDK validation and parse
├── Apache POI parse and optional save
├── LibreOffice open and save
└── Microsoft Office open and save on a dedicated Windows runner
```

Tumbler reparses consumer-saved output and compares the supported semantic
projection. A consumer pass requires:

- no crash or repair dialog;
- the intended edit remains;
- supported semantics remain;
- unrelated content is not unexpectedly lost;
- no newly invalid package structure appears.

Microsoft Office automation should run only on trusted or generated fixtures in
a controlled, licensed environment. Untrusted uploads never reach that runner.

## 8. Existing suites and corpora

The initial federation is:

| Source | Formats | Use |
| --- | --- | --- |
| Open XML SDK | DOCX, XLSX, PPTX | Schema/semantic validator and curated fixtures |
| Apache POI | DOCX, XLSX, PPTX | Regression corpus and independent parser/writer |
| LibreOffice | DOCX, XLSX, PPTX | Large importer/exporter corpus and round trips |
| docx | DOCX | Programmatically generated feature cases |
| ExcelJS | XLSX | Spreadsheet feature cases and comparisons |
| PptxGenJS | PPTX | Broad generated slide cases |

Upstream fixtures are pinned by commit. They are vendored only after license and
provenance review; otherwise CI fetches them or we create clean-room equivalents.

Tumbler also needs its own standards-derived corpus because no existing project
tests our preservation contract or UI behavior.

## 9. Visual and interaction regression

Visual tests exercise the actual Svelte head at fixed browser, font set, device
scale, locale, and viewport.

Use several signals together:

- screenshots;
- DOM or SVG semantic snapshots;
- extracted text, bounding boxes, baselines, and geometry;
- hit-testing results;
- keyboard navigation and selection state;
- caret and overlay placement;
- edit followed by incremental rerender;
- scrolling, zooming, resizing, and virtualization boundaries.

Pixel tolerances and masks must be narrow and explained. Structural and geometry
assertions prevent antialiasing noise from hiding real layout regressions.

Reference visuals can be captured from Microsoft Office and LibreOffice for
carefully controlled fixtures. These are compatibility evidence, not a runtime
conversion technique.

## 10. Metamorphic tests

Metamorphic tests validate consequences without prescribing exact serialized
bytes:

- inserting a spreadsheet row shifts formulas, merges, validations, tables, and
  named ranges correctly;
- renaming a sheet updates references that should follow it;
- moving a slide shape changes its transform without rewriting unrelated shapes;
- duplicating a slide creates distinct IDs and relationships;
- editing a Word paragraph preserves numbering and style inheritance;
- deleting an image removes media only when no remaining relationship uses it;
- changing a theme color affects theme-derived values but not explicit colors;
- save/open/save converges rather than accumulating changes.

## 11. Performance and resource tests

Maintain representative stress documents:

- large sparse worksheets and dense worksheets;
- very long documents with tables and images;
- presentations with hundreds of slides and media-heavy scenes;
- excessive styles, shared strings, relationships, and drawing objects.

Measure:

- time to package inventory;
- time to first useful render;
- total parse and layout time;
- viewport scroll latency;
- command latency;
- save latency;
- peak and retained memory;
- repeated open/close leaks;
- worker cancellation and stale-result handling.

Budgets should be recorded per corpus class and tightened from real measurements.

## CI tiers

### Every commit

Target a few minutes:

- focused behavior tests;
- structural validation;
- small curated corpus;
- deterministic property seeds;
- preservation checks;
- TypeScript checks.

### Every pull request

- full curated corpus;
- Open XML SDK and Apache POI validation;
- LibreOffice round trips;
- visual and interaction regressions;
- time-boxed fuzzing;
- performance smoke budgets.

### Nightly

- thousands of randomized documents and command histories;
- complete pinned upstream manifests;
- longer fuzzing;
- consumer and browser matrices;
- memory, cancellation, and leak tests;
- retained failing artifacts and seeds.

### Release qualification

- extended fuzzing;
- Strict and Transitional coverage;
- declared Office version matrix;
- Microsoft Office runner;
- no unexplained repair dialogs;
- no unexpected part loss;
- published capability and conformance report.

Known failures may be allowlisted only with an issue, reason, owner, and expiry.
They must remain visible in reports.

## Defect workflow

Every compatibility or corruption defect produces:

1. a minimized, sanitized fixture or random seed;
2. a statement of expected behavior;
3. a permanent regression test at the lowest appropriate layer;
4. the responsible requirement or compatibility record;
5. captured validator and consumer diagnostics.

Original customer files stay private and should be minimized before becoming
shared fixtures.
