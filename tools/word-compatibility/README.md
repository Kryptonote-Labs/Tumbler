# Word standards qualification

This tool reports how much of Tumbler's versioned Word standards inventory has
been qualified with reviewed, executable evidence. Unsupported and unreviewed
areas remain in the denominator. The initial score is deliberately **0%**.

That does not mean Tumbler implements nothing. It means none of the indexed
standards topics has yet received a complete qualification plan covering all
applicable dimensions. Fifteen executable scenarios already check narrower
behaviour, with separate semantic, preservation, SDK and consumer results.
Those passes must not turn into an invented feature-support percentage.

## Run

```sh
bun run compatibility:word
bun run compatibility:word -- --require-openxml --require-libreoffice
bun run compatibility:word -- --inventory-only
bun run compatibility:word:check
bun test tools/word-compatibility/test
```

Normal runs use the Open XML SDK when `dotnet` is available. Set `DOTNET` to an
absolute executable path if necessary. LibreOffice is opt-in with `--libreoffice`
or mandatory with `--require-libreoffice`. `--require-openxml` requires SDK
success. Microsoft Word and reference layout remain explicitly blocked.

Use `--output /absolute/empty/directory` for a known destination. Without it,
results go into a new ignored `compatibility-results/word-*` directory. Existing
nonempty destinations are rejected: a stale consumer-produced file must never
be mistaken for a new successful conversion.

Every run writes:

- `report.json`: every topic, dimension, scenario, result and artifact hash;
- `report.md`: CI summary, counts, limits and evidence diagnostics;
- `report.html`: offline searchable inventory and results;
- before/after DOCX fixtures, consumer-saved DOCX files and validator logs;
- actual SDK/runtime/consumer version information.

No production dependency or document-authoring limit is introduced.

## Scope v1

The committed inventory contains **4,482 leaf topics** from eight sources. Each
entry identifies the source, section, printed page and title. Parent headings
do not add score credit. The source manifest pins the actual PDF and extracted
text SHA-256, not just a moving documentation URL.

| Source | Selected leaf topics | Scope |
| --- | ---: | --- |
| ECMA-376 Part 1, fifth edition 2016 | 2,151 | Conformance, packages, Word parts, shared parts, WordprocessingML, shared DrawingML, charts, diagrams, math, metadata and bibliography |
| ECMA-376 Part 2, fifth edition 2021 | 68 | OPC conformance, package model, names, relationships, physical mapping and signatures |
| ECMA-376 Part 3, fifth edition 2015 | 12 | Markup compatibility processing and extensibility |
| ECMA-376 Part 4, fifth edition 2016 | 392 | Word Transitional behaviour, shared legacy DrawingML and VML |
| MS-DOCX | 166 | Word-specific extensions and settings |
| MS-ODRAWXML | 559 | Shared/Word drawing, chart, diagram, ink, SVG and other drawing extensions |
| MS-OEXTXML | 5 | Extensibility-list extensions |
| MS-OI29500 | 1,129 | Microsoft implementation notes referring to the selected ECMA chapters |

The Microsoft editions are pinned to the repository's local reference archive
acquired on 2026-08-02. The checksum, rather than that date alone, identifies the
exact source. Updating to newer specifications is a deliberate scope revision.

The inventory includes substantial unimplemented work: tracked formatting and
moves, content controls, document protection, complex field evaluation, mail
merge, glossary documents, embedded objects, legacy drawings, complex scripts,
font substitution, equations, diagrams, chart semantics and package signatures.
It is not limited to what current Tumbler dependencies support.

The source selection excludes unrelated spreadsheet/presentation chapters and
explicit Excel/PowerPoint drawing-extension branches. Shared components are
included broadly; a topic's applicability still requires review. This PR covers
Word documents, not the complete XLSX/PPTX standards or Word's entire app UI.

## What the inventory is not

A table-of-contents entry is **not an atomic normative requirement**. A leaf can
contain multiple MUSTs, defaults, schema constraints and interactions. Some
headings are descriptive rather than normative. The importer cannot decide
those questions. The denominator therefore measures qualification of indexed
topics, not a count of all normative rules and not a probability that a user's
file works.

The extraction does not establish complete coverage of annexes, XSD facets,
embedded format specifications, every Microsoft extension, all prose, or all
feature combinations. These are explicit inventory gaps, not passed work.
Qualified coverage of this inventory must never be advertised as full OOXML
conformance. Equal topic weights are reproducible, but the topics differ in
complexity and importance. Count and scope version must accompany a percentage.

## Qualification and scoring

Each topic starts `unreviewed`. A reviewed entry in `qualifications.ts` must
supply applicability and acceptance criteria for all six dimensions:

| Dimension | Minimum required independent evidence |
| --- | --- |
| Read | Explicit semantic assertions against stated expectations |
| Preserve | Byte/payload and package-entry comparisons |
| Write | Open XML SDK validation |
| Edit | Semantic assertions and Open XML SDK validation |
| Render | Reference-layout comparison |
| Interoperate | Microsoft Word consumer evidence |

These are minimum evidence kinds, not sufficient test coverage by themselves.
Reviewers must evaluate whether the stated criteria exhaust the topic's relevant
obligations. LibreOffice evidence is useful but cannot stand in for Word.

An applicable dimension lists mandatory `(scenario, oracle)` evidence IDs.
Every listed result must pass. A known failing scenario defeats qualification
even if the plan forgot to list that counterexample. Evidence must be declared,
unique, belong to the same topic and claim the relevant dimension. Existing test
names or registered methods alone earn no credit.

A dimension can be `not-applicable` only with a documented standards-based
reason. "Unsupported", "hard", and "our model cannot represent it" are not
reasons. A plan cannot mark an entire topic not applicable; removing a topic
requires a reviewed, versioned inventory change instead.

The headline is:

```text
fully qualified topics / all indexed topics × 100
```

There are no guessed weights or partial-credit estimates. A topic earns one
unit only when every applicable dimension is verified. The dimension reports
exclude only explicitly justified N/A dimensions. Missing plans remain in every
dimension denominator until reviewed. Empty denominators display `n/a`, never
100%. Display percentages truncate to four decimal places so incomplete work
cannot round up to 100%.

Status precedence is failed, unreviewed, untested, blocked, verified. The full
report retains dimension and oracle results, so the headline status cannot hide
which checks passed or why others did not run. Missing evidence is `untested`;
unavailable tools are `blocked`. Neither earns credit.

## Adding real evidence

1. Locate the exact source topic and inspect its normative prose and schema.
2. Define explicit outcomes, negative cases, defaults, boundary values and
   interactions. Keep broad unresolved obligations visible.
3. Add a scenario with typed parameters and assertions in the test runner.
   New scenario modules can be added as this grows; avoid a single giant file.
4. Generate or import a licensed, sanitized fixture with known provenance.
   Use an independent validator or consumer where the dimension requires it.
5. Preserve fixture bytes, oracle logs, input/output hashes and environment.
6. Add a qualification plan only after the complete topic and all dimension
   applicability decisions have been reviewed. Link every mandatory check.
7. Run the evaluator and review the complete report, including new failures.

The initial fixtures are synthetic documents authored in repository code from
public format knowledge. They contain no customer files or copied Office
assets. Existing library tests remain valuable without being automatically
promoted into whole-clause qualification.

## Determinism and provenance

Scoring is a pure function of a fixed inventory, qualification plans and evidence.
Tests exercise missing, duplicate, mismatched, blocked and failing evidence,
invalid exclusions, empty denominators and inappropriate validation shortcuts.

The CLI generates evidence in-process; it does not accept hand-authored pass
records. It fingerprints tracked and nonignored untracked source bytes, records
the commit, and refuses a run if source files change during execution. Evidence
artifacts have SHA-256 hashes. Timestamps do not participate in scoring.

Consumer outcomes can vary with the environment. CI pins Bun, .NET SDK and the
Open XML SDK package. It records the installed LibreOffice version; Ubuntu's
LibreOffice package can change. Layout is not qualified by this environment.
Future visual qualification must pin fonts, Office/browser versions, locale,
device scale and reference geometry. Capturing versions makes differences
traceable; it does not make different environments equivalent.

## CI and scope changes

The Word job runs on PRs and pushes, requires SDK and LibreOffice execution,
and uploads reports and artifacts even on failure. Known scenario failures or
missing required tools fail the job. An honest zero score does not fail CI.
Missing Word evidence remains visible and prevents interoperability credit.

The inventory lock verifies file hashes and counts. PR CI compares it with the
base commit. Any inventory-content change requires a higher version and a new
scope ID; explain additions and removals in the PR. Scores from different scopes
are not directly comparable. Qualification plans and criteria changes also need
review, even when the inventory itself remains unchanged.

Regenerate against the exact ignored reference archive:

```sh
python3 tools/word-compatibility/import-inventory.py docs/reference/vendor --check
```

Omit `--check` only when deliberately regenerating. The importer currently emits
v1; update the version/scope in the importer as part of a new inventory revision.
Official standards prose and schema archives are not redistributed here; the
committed catalog contains section-reference metadata only.

## Outstanding qualification work

These gaps are not reasons to restrict what users can author:

- Review every indexed topic into actual normative obligations and applicability.
- Audit extraction coverage against schema declarations, annexes and prose.
- Add cross-feature cases: tracked edits in nested tables, content controls in
  headers, floating drawings beside notes, style/numbering inheritance across
  sections, bidi mixed with fields, and MCE branches around edited content.
- Add real-producer documents from Word, LibreOffice, Google Docs and Pages.
- Run controlled Microsoft Word open/save and rendering on a dedicated runner.
- Compare pagination, text geometry, font substitution, object placement and
  reference field values as well as screenshots.
- Exercise Kryptonote's actual agent and human editing paths, durable state,
  concurrent edits, undo/redo and export against the same Tumbler contract.
- Establish hostile-input, cancellation and resource-behaviour qualification.

These require further implementations and evidence. This PR makes their absence
visible rather than claiming they have already been solved.
