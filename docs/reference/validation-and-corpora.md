# Validation tools and corpora

## No single conformance suite exists

OOXML correctness needs several independent signals:

```text
standards requirements
+ schema/semantic validation
+ preservation comparison
+ generated/property cases
+ historical regression corpora
+ real consumer open/save
+ native UI visual/interaction tests
```

Each catches a different class of defect. A schema-valid file can still provoke
an Office repair or render incorrectly; a file that opens can still lose unknown
content during save.

## Open XML SDK

[Repository](https://github.com/dotnet/Open-XML-SDK)

Uses:

- `OpenXmlValidator` for schema and SDK semantic constraints;
- version-targeted validation;
- generated schema metadata as a comparison source;
- test data and historical regressions after provenance review;
- independent part traversal and semantic projection.

Create a tiny pinned .NET command that accepts a path and target Office version
and emits machine-readable diagnostics:

```json
{
  "valid": false,
  "errors": [
    {
      "id": "validation-id",
      "part": "/word/document.xml",
      "path": "schema path",
      "description": "summary"
    }
  ]
}
```

Run it on every Tumbler-produced fixture in deep CI. Keep the SDK version in the
report because validator behavior evolves.

## Apache POI

[Repository](https://github.com/apache/poi)

Relevant APIs/suites:

- XWPF for WordprocessingML;
- XSSF for SpreadsheetML;
- XSLF for PresentationML;
- repository `test-data` and format-specific regression tests.

Use POI to:

- open Tumbler output and enumerate supported semantic values;
- optionally save a copy for Tumbler to reparse;
- contribute unusual historical fixtures;
- disagree independently with Open XML SDK and LibreOffice.

POI is not a visual oracle and its high-level models do not expose every unknown
extension. Treat differences as evidence to investigate, not automatic proof
that Tumbler is wrong.

## LibreOffice

[Repository](https://github.com/LibreOffice/core)

LibreOffice maintains extensive importer/exporter regression cases for Writer,
Calc, and Impress. Relevant areas include Writer OOXML export tests and format
data under the `sw`, `sc`, and `sd` quality-assurance trees.

Use a pinned build/container to:

- open curated documents headlessly;
- save into a separate output;
- detect crashes and conversion errors;
- reparse output with Tumbler;
- compare supported semantics and package structure;
- create secondary reference visuals.

LibreOffice's source and fixtures span multiple licenses. Prefer pinned CI fetch
manifests or reviewed individual fixtures over copying the whole corpus.

## Microsoft Office runner

A controlled Windows machine with licensed Office is the highest-value
compatibility oracle for repair behavior and native layout.

Responsibilities:

- open only trusted/generated/sanitized fixtures;
- record application/version/build;
- detect repair prompts and recovery logs;
- save to a new file;
- optionally export structured evidence or controlled screenshots;
- return artifacts to the test controller;
- reset application state between tests.

Do not send arbitrary user uploads to an automation runner. Do not treat Office
screenshots as the product rendering pipeline.

## Format-specific producers

### `docx`

Generate focused combinations of Word paragraphs, styles, tables, numbering,
headers, footers, drawings, and sections. These cases help distinguish Tumbler
parsing errors from hand-authored fixture mistakes.

### ExcelJS

Generate workbook, cell, style, merge, formula, image, and sheet-layout cases.
Compare raw package output as well as its high-level readback.

### PptxGenJS

Generate slides spanning shapes, text, images, charts, tables, themes, and
positioning. Its demos are useful feature inventories for visual fixtures.

Generated cases remain producer-specific. Cross the same logical feature with
files saved by Office and LibreOffice.

## Corpus manifest

Every fixture should have sidecar metadata or a central manifest:

```yaml
id: xlsx-date-1900-boundary
format: xlsx
source:
  kind: generated
  producer: exceljs
  producer_version: 4.x
license: MIT
features:
  - spreadsheet.cell.date
  - spreadsheet.date_system.1900
expected:
  open: pass
  preserve: pass
  render: supported
privacy: public
```

For upstream fixtures add repository, commit, path, checksum, and notices. For
real-world private fixtures use an opaque local ID and sanitized/minimized
derivatives.

## Corpus dimensions

Avoid a corpus made only of pretty feature demos. Include:

- minimum legal packages;
- each optional part independently;
- feature combinations;
- malformed near-misses;
- Strict and Transitional variants;
- Microsoft extension namespaces by version;
- files from Office, LibreOffice, Google, Apple, and other actual producers where
  licensing permits;
- repaired files and their original damaged forms;
- large sparse and dense stress cases;
- hostile/security cases;
- every historical Tumbler defect.

## Differential comparison

Consumers expose different semantics. Compare a deliberately normalized
projection rather than arbitrary serialized bytes:

- package part/relationship inventory;
- document text and structure;
- worksheet scalar/formula/style/range state;
- slide shape/text/geometry state;
- supported theme and visual properties;
- validator/repair diagnostics.

Preservation remains a separate direct comparison against Tumbler's input.

## Failure artifacts

Archive on failure:

- original fixture ID and checksum;
- Tumbler output;
- minimized output when fuzz-generated;
- seed and command sequence;
- package diff;
- validation JSON;
- consumer-saved copies;
- screenshots/geometry diffs when relevant;
- timing and memory measurements;
- exact tool versions.

This makes failures reproducible without another web lookup or CI archaeology.
