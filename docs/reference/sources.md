# Standards and source map

## Primary standards

### ECMA-376

Official landing page:
[ECMA-376 Office Open XML file formats](https://ecma-international.org/publications-and-standards/standards/ecma-376/)

The current ECMA publication is split into four independently versioned parts:

| Part | Edition used here | Main subject | Highest-value clauses for Tumbler |
| --- | --- | --- | --- |
| 1 | 5th, December 2016 | Fundamentals and markup reference | 2, 8–16, 17–23, Annexes A, C, K, L |
| 2 | 5th, December 2021 | Open Packaging Conventions | 4, 6–10, Annexes B–D |
| 3 | 5th, December 2015 | Markup Compatibility and Extensibility | 7–9, Annex A |
| 4 | 5th, December 2016 | Transitional migration features | Consult by element/feature when reading Transitional files |

Official archive URLs:

- [Part 1 ZIP](https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip)
- [Part 2 ZIP](https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip)
- [Part 3 ZIP](https://ecma-international.org/wp-content/uploads/ECMA-376-3_5th_edition_december_2015.zip)
- [Part 4 ZIP](https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip)

The archives also contain the official Strict and Transitional W3C XML Schema
and RELAX NG resources. Part 1 additionally includes preset DrawingML geometry,
spreadsheet style, and Word border resources.

Do not silently treat the Part 1 schema as the whole standard. Written
constraints supplement the schemas, OPC is separate, MCE changes how input is
processed, and Microsoft extensions live outside ECMA-376.

### ISO/IEC 29500

[ISO/IEC 29500-1:2016](https://www.iso.org/standard/71691.html) is the related
international standard family. ECMA and ISO editions do not all advance at the
same time, so requirement records must identify the exact part and edition.

## Microsoft implementation and extension documentation

### General implementation notes

[[MS-OE376]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/cc313153-88b6-4a89-9fdd-8f21e8d1ffb3)
documents how Microsoft Office implements ECMA-376, including additional detail,
known variations, and extensions. This source is essential whenever standards-
valid output differs from observed Office behavior.

### Format extensions

- [[MS-XLSX]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/f780b2d6-8252-4074-9fe3-5d7bc4830968)
  covers Excel extensions to SpreadsheetML.
- [[MS-PPTX]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/baa5ff29-d315-43ed-ac03-cf6c10baea59)
  covers PowerPoint extensions to PresentationML.
- [[MS-DOCX]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx/b839fe1f-e1ca-4fa6-8c26-5954d0abbccd)
  covers Word extensions to WordprocessingML.
- The broader documents are indexed from the
  [Word, Excel, and PowerPoint Standards Support overview](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-offstandlp/d5784a8b-7070-466b-befa-b7bf3724c6f0).

Microsoft documents can change independently of the ECMA standard. Pin the
revision or download date used to create a test requirement.

### Open XML SDK documentation

- [Open XML SDK repository](https://github.com/dotnet/Open-XML-SDK)
- [`OpenXmlValidator`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.validation.openxmlvalidator.validate)
- [Package and general topics](https://learn.microsoft.com/en-us/office/open-xml/general/overview)
- [Markup compatibility introduction](https://learn.microsoft.com/en-us/office/open-xml/general/introduction-to-markup-compatibility)

SDK class names can help locate corresponding schema elements, but they are not
Tumbler's model design. SDK behavior can also preprocess and discard MCE branches
depending on open settings, which makes preservation tests important.

## Independent implementations and test sources

| Project | License family | Relevant areas | Intended use |
| --- | --- | --- | --- |
| [Open XML SDK](https://github.com/dotnet/Open-XML-SDK) | MIT | All OOXML | Validator, schema metadata, fixtures, differential parse |
| [Apache POI](https://github.com/apache/poi) | Apache-2.0 | XWPF, XSSF, XSLF | Regression corpus and parser/writer oracle |
| [LibreOffice](https://github.com/LibreOffice/core) | Mixed MPL/LGPL/GPL | All formats | Import/export corpus, open/save oracle |
| [docx](https://github.com/dolanmiu/docx) | MIT | DOCX generation | Focused Word feature generation |
| [ExcelJS](https://github.com/exceljs/exceljs) | MIT | XLSX | Spreadsheet generation and comparison |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | MIT | PPTX generation | Focused slide feature generation |

Record per-file provenance before copying fixtures. Prefer pinned upstream
manifests when a repository has mixed licensing or unclear fixture ownership.

## Supporting web standards

OPC and OOXML depend on general web/XML rules. The most relevant primary sources
are:

- [XML 1.0](https://www.w3.org/TR/xml/)
- [Namespaces in XML](https://www.w3.org/TR/xml-names/)
- [XML Base](https://www.w3.org/TR/xmlbase/)
- [URI syntax, RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
- [Media types, RFC 6838](https://www.rfc-editor.org/rfc/rfc6838)
- [ZIP APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)

Use ECMA-376 Part 2's constrained application of these standards rather than
implementing raw ZIP or URI behavior and assuming it is OPC behavior.

## Clause-routing cheat sheet

| Question | Start here |
| --- | --- |
| Is this package/part name legal? | ECMA-376-2 §6.2 and §7.3 |
| How does a relationship target resolve? | ECMA-376-2 §6.4–6.5 |
| How are content types selected? | ECMA-376-2 §7.2.3 and §7.3.7 |
| How are signatures represented? | ECMA-376-2 §10 |
| What should happen to an unknown namespace? | ECMA-376-3 §7–9 |
| What parts can occur in a Word package? | ECMA-376-1 §11 |
| What parts can occur in a workbook? | ECMA-376-1 §12 |
| What parts can occur in a presentation? | ECMA-376-1 §13 |
| Which shared drawing parts exist? | ECMA-376-1 §14–15 |
| Exact Word element semantics | ECMA-376-1 §17 |
| Exact spreadsheet element/formula semantics | ECMA-376-1 §18 |
| Exact presentation element semantics | ECMA-376-1 §19 |
| Exact DrawingML semantics | ECMA-376-1 §20–21 |
| Transitional-only markup | ECMA-376-4 |
| Microsoft-specific behavior | MS-OE376, then MS-XLSX/MS-PPTX/Word documents |

## Copyright and repository policy

The official standards and implementation notes have their own copyright and
permission terms. This repository stores our explanations, concise examples, and
clause references. It does not vendor complete converted standards. Before an
OSS release, audit any copied schema, code sample, fixture, or normative text and
retain all required notices.
