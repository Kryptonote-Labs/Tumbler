# Shared OOXML implementation status

The first shared OOXML vertical slice converts package safety into a typed,
source-preserving semantic edit. Normative references are the vendored
ECMA-376 Part 2 and Part 3 documents under `docs/reference/vendor/markdown/ecma/`.

## Loss-aware XML

`parseLosslessXml` pairs two independent representations:

- a bounded lexical scanner records exact character spans, quote style,
  prefixes, attribute order, comments, CDATA, processing instructions, and raw
  source text;
- `saxes` independently validates XML well-formedness, namespaces, expanded
  names, decoded values, encoding declarations, and configured resource limits.

The lexical scanner does not replace semantic validation, and the semantic
parser is not used as a serializer. This separation lets Tumbler retain source
syntax without trusting it.

`LosslessXmlEditor` currently supports:

- replacing element text;
- setting, inserting, and removing attributes;
- appending simple text elements;
- removing elements;
- deterministic multiple insertions;
- overlap rejection;
- UTF-8, UTF-16LE, and UTF-16BE output with BOM retention;
- byte-identical no-op output;
- mandatory reparse before a successful commit.

Edits operate on immutable source nodes. A failed reparse or conflicting edit
leaves the editor active and the original document unchanged.

## Markup Compatibility

The read-only compatibility view implements the first Part 3 projection:

- inherited `mc:Ignorable` namespaces;
- inherited `mc:ProcessContent` name patterns;
- `mc:MustUnderstand` checks;
- ordered `mc:Choice` selection by understood namespaces;
- `mc:Fallback` selection;
- structural checks for `mc:AlternateContent`.

The projection never modifies the source tree. Full application-defined
extension boundaries and complete three-step MCE output processing remain open
before this can be described as general Part 3 conformance.

## Core Properties vertical slice

Core Properties are discovered through the package relationship defined by
ECMA-376 Part 2 §8.2 rather than by assuming `/docProps/core.xml`.

Implemented behavior includes:

- at most one Core Properties part and package relationship;
- the required Core Properties media type;
- root, namespace, non-repeatability, attribute, and simple-content checks;
- Dublin Core, DCMI Terms, and OPC-defined properties from §8.1;
- `xsi:type="dcterms:W3CDTF"` requirements;
- supported W3CDTF date/date-time lexical validation;
- localized mixed `keywords` values and `xml:lang`;
- rejection of Markup Compatibility markup as required by §8.3.2;
- surgical editing of existing properties;
- namespace declaration insertion when required;
- transactional creation of a missing part, content type, and relationship;
- exact preservation of unrelated compressed package entries.

The same tests execute against Word, spreadsheet, and presentation packages.
This is metadata editing, not yet paragraph, cell, formula, shape, or slide
editing.

## Qualification evidence and gaps

The generated suite exercises thousands of hostile or generated cases,
including arbitrary bytes, every one-byte mutation of a representative XML
fixture, Unicode value shrinking, encoding matrices, deterministic histories,
and edit/remove convergence.

Remaining boundaries:

- The lexical writer handles the operations needed by the current vertical
  slice; it is not a general XML construction API.
- Full MCE processing and preservation inside application-defined extension
  elements need more Part 3 work.
- Schema-derived validation is intentionally focused. It does not replace the
  official schemas or Open XML SDK validation.
- No WordprocessingML, SpreadsheetML, PresentationML, or DrawingML semantic
  model exists yet.
- Real Microsoft Office, LibreOffice, Open XML SDK, and Apache POI qualification
  remains blocked on local tools and licensed/provenanced fixtures.
