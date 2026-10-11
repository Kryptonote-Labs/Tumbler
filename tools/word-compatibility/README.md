# Word compatibility contract

The score is the fraction of explicit requirements verified by executable checks.
LibreOffice Writer is our current interoperability reference. A successful
LibreOffice round trip earns interoperability credit when the stated semantic
assertions also pass. Microsoft Word is not required and does not block CI.
Open XML SDK remains an independent validity check for writing and editing.

The initial contract has 80 requirements. Sixteen have executable checks;
64 broader requirements remain untested, including layout, tables, styles,
notes, fields, tracked revisions and equations. Untested means evidence is
missing, not necessarily that the library lacks the feature.

A separate inventory contains 4,482 standards topics. It remains the expansion
backlog, with counts for topics linked to requirements and topics with no
requirements yet. A topic link is traceability, not complete clause coverage.
The requirement percentage must never be presented as a percentage of all Word
features or complete OOXML conformance.

## Run

```sh
bun run compatibility:word -- --require-openxml --require-libreoffice
bun run compatibility:word -- --inventory-only
bun run compatibility:word:check
bun test tools/word-compatibility/test
```

Normal runs use Open XML SDK when `dotnet` is available. Set `DOTNET` to an
absolute executable path if necessary. LibreOffice is opt-in with `--libreoffice`
or mandatory with `--require-libreoffice`, as in CI. Missing tools produce
blocked evidence; required tool failures fail the command.

Use `--output /absolute/empty/directory` for a known destination. Otherwise,
results go into a new ignored `compatibility-results/word-*` directory. Nonempty
destinations are rejected so stale conversions cannot count as new evidence.

Every run writes JSON, Markdown, searchable offline HTML, a small `comment.json`,
DOCX fixtures, consumer outputs, validator logs, artifact hashes and tool
versions. JSON also retains the full standards inventory.

## Scoring

`requirements.ts` maps concrete acceptance criteria to mandatory scenario and
oracle pairs. `pending-requirements.ts` defines unresolved requirements with
empty checks. Each requirement belongs to one dimension and counts once:

| Dimension | Required evidence |
| --- | --- |
| Read | Semantic assertions |
| Preserve | Byte/payload and package-entry comparisons |
| Write | Open XML SDK validation |
| Edit | Semantic assertions and Open XML SDK validation |
| Render | Reference-layout comparison |
| Interoperate | LibreOffice conversion and semantic assertions on its output |

Every listed check must pass. Failure takes precedence over missing evidence,
then blocked evidence, then verification. Missing checks or results are untested.
No manual review gate prevents passing executable requirements from earning
credit. Duplicate, unknown or mismatched evidence is rejected. A renderer cannot
earn credit from schema validation or a consumer merely opening the file.

Each dimension reports `verified / total`. Empty denominators display `n/a`.
The overall score counts every requirement equally; complexity is not weighted.
Acceptance criteria and fixture scope define what a pass actually establishes.

To add evidence, inspect the relevant standard, define the observable behaviour,
add scenarios and link all mandatory checks. Keep untested obligations visible.
Add boundary, negative and cross-feature cases where the criteria require them.
The existing fixtures are synthetic and contain no customer files or Office assets.

## CI and PR comments

`word-compatibility.yml` runs when Word, shared document infrastructure, the UI,
validation tools or their configuration changes. It runs head and base in separate
Ubuntu jobs with the same Bun and .NET versions, requires SDK and LibreOffice,
and retains reports even when evidence fails. A low score alone does not fail CI.

`word-compatibility-comment.yml` updates one compact table on the PR after the
run finishes. It reads validated numeric/status data from artifacts and executes
only default-branch code with the comment token. Fork code never executes with
that token. Stale heads and older runs do not replace newer results. Failed runs
without reports replace stale success with an unavailable-result notice.

The commenting workflow becomes active after it reaches the default branch.
The first base without this report schema has no comparison. Later runs compare
unchanged requirement definitions, show gained/lost verification, and list added,
removed or changed requirements. A changed denominator or acceptance criterion
shows `scope changed` instead of a misleading percentage delta.

Requirement definitions have individual SHA-256 hashes and the whole contract
has a hash. The standards lock separately verifies inventory hashes and counts;
changing inventory content requires a higher version and new scope ID.

## Determinism and limits

Scoring is a pure function of the contract and collected evidence. The CLI
fingerprints tracked and nonignored source bytes and rejects source changes
during a run. Tool versions and input/output hashes make results traceable.
CI pins Bun, .NET and Open XML SDK; Ubuntu supplies LibreOffice and its actual
version is recorded. External consumer behaviour can change between environments.

LibreOffice is an accepted reference, not proof that Microsoft Word behaves
identically. Rendering has no reference checks yet. Future work includes controlled
layout comparisons, real-producer fixtures, interactions between features, and
Kryptonote's human and agent editing paths. None of these gaps impose authoring
limits on users.

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
those questions. These topics are therefore a coverage backlog, separate from
the executable requirement denominator. Neither count predicts whether an
arbitrary user document will work.

The extraction does not establish complete coverage of annexes, XSD facets,
embedded format specifications, every Microsoft extension, all prose, or all
feature combinations. These are explicit inventory gaps, not passed work.
The inventory must never be advertised as complete OOXML conformance coverage.
Topics differ in complexity and importance. Contract count and scope must
accompany a requirement percentage.

## Regenerate the inventory

```sh
python3 tools/word-compatibility/import-inventory.py docs/reference/vendor --check
```

Use the exact ignored reference archive identified by the source manifest.
Omit `--check` only for deliberate regeneration. A new inventory revision also
requires updating the importer's version/scope. The catalog redistributes section
metadata only, not standards prose or schema archives.
