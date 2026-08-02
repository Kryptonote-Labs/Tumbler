# Standards and compatibility

## Sources of truth

The normative OOXML foundation is
[ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/):

- Part 1: Fundamentals and Markup Language Reference.
- Part 2: Open Packaging Conventions.
- Part 3: Markup Compatibility and Extensibility.
- Part 4: Transitional Migration Features.

The corresponding international family is
[ISO/IEC 29500](https://www.iso.org/standard/71691.html).

Real Microsoft Office compatibility also requires Microsoft's published
implementation notes and extensions, beginning with
[[MS-OE376]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/cc313153-88b6-4a89-9fdd-8f21e8d1ffb3)
and the relevant DOCX, XLSX, and PPTX Open Specifications.

The standards answer what is conforming. Microsoft Office, LibreOffice, Apache
POI, and other mature consumers answer what interoperates in practice. Neither
source replaces the other.

## Conformance profiles

Tumbler should recognize and report:

- OOXML Strict;
- OOXML Transitional;
- application extension namespaces;
- markup-compatibility choices and fallbacks;
- macro-enabled packages;
- external relationships;
- digital signatures;
- embedded and custom parts.

Initial writing will probably target the profile already used by the source
document rather than migrating it implicitly. Format migration should be an
explicit operation backed by dedicated tests.

## Requirement manifests

Normative requirements should become test-addressable records:

```yaml
id: OPC-REL-TARGET-001
source: ECMA-376-2
clause: Relationships
area: opc.relationships
formats: [docx, xlsx, pptx]
level: must
tests:
  - rejects_missing_internal_target
  - preserves_external_target
  - resolves_relative_target
```

The manifest should store references and concise paraphrases rather than copies
of standards text. It will eventually generate:

- missing-test reports;
- conformance matrices;
- positive and negative case inventories;
- format-specific compatibility reports;
- links from failures to the governing requirement.

Official schemas can inform code generation and tests. Their redistribution and
the redistribution of standards material must receive a licensing review before
an OSS release.

## Compatibility policy

Compatibility must be stated as a matrix, not a global percentage. Each feature
has separate parse, preserve, render, edit, write, and consumer results.

An example status record might say:

```text
Word / basic paragraph formatting
  parse:       supported
  preserve:    supported
  render:      supported with font caveats
  edit:        supported
  write:       Transitional
  consumers:   Word 365 pass, LibreOffice pass, POI pass
```

Passing XML schemas alone is not compatibility. A release cannot claim a
consumer pass if that consumer repairs the file, loses the edited value, moves
unrelated content, or changes supported semantics after opening and saving.

## Preservation levels

For every save, the testkit should distinguish:

1. **Byte preservation** — untouched ZIP entry bytes are identical.
2. **XML preservation** — semantically irrelevant serialization changes only.
3. **Semantic preservation** — supported and unsupported meaning survives.
4. **Visual preservation** — rendered output stays within defined tolerances.

Byte preservation is the default target for untouched parts. Changed parts need
more nuanced subtree and semantic comparisons.

Unknown elements, attributes, `extLst` content, `AlternateContent`, custom XML,
embedded media, and unfamiliar relationships must remain attached to their
correct owners. Unsupported does not mean disposable.

## Active and sensitive content

- Macros may be detected and preserved but never executed.
- Embedded objects are inert unless a separately reviewed capability handles
  them.
- External relationships are exposed and controlled by host policy.
- Digital signatures are detected; any edit that invalidates one must be made
  explicit to the host.
- Test fixtures derived from customer documents remain private, minimized, and
  sanitized.

## External projects

Useful independent implementations and corpora include:

- [Microsoft Open XML SDK](https://github.com/dotnet/Open-XML-SDK), including
  `OpenXmlValidator` and its test data;
- [Apache POI](https://github.com/apache/poi) for XWPF, XSSF, XSLF, and historical
  regression documents;
- [LibreOffice core](https://github.com/LibreOffice/core) for importer/exporter
  regressions and open/save behavior;
- [docx](https://github.com/dolanmiu/docx),
  [ExcelJS](https://github.com/exceljs/exceljs), and
  [PptxGenJS](https://github.com/gitbrent/PptxGenJS) as focused document
  producers and comparison implementations.

No upstream suite establishes universal conformance. Tumbler's quality claim
must combine these sources with standards-derived and generated cases.

Before redistributing upstream fixtures, record their exact repository revision,
path, license, provenance, and any required notices. LibreOffice's mixed license
set makes pinned CI fetching or clean-room reproduction preferable to casually
vendoring its entire corpus.
