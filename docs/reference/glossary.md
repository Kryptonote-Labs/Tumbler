# Glossary and namespace crib sheet

## Terms

**Consumer** — software that reads an OOXML package.

**Producer** — software that creates or writes an OOXML package. An editor is
both consumer and producer.

**Package** — the logical OPC container represented physically as a ZIP archive.

**Part** — a named byte stream inside the logical package with an associated
media type.

**ZIP item** — the physical archive entry used to store a part or package
infrastructure item.

**Relationship** — a source-scoped edge with ID, type, target, and optional
external target mode.

**Relationship part/item** — XML containing the outgoing relationships for the
package or a source part.

**Main document part** — the Word document, workbook, or presentation part
targeted by the package office-document relationship.

**Content type** — the media type associated with a part through a default or
override in `[Content_Types].xml`.

**Expanded name** — an XML name represented by namespace URI and local name.
Prefixes are not identity.

**Strict** — the stricter OOXML vocabulary/profile intended to exclude many
legacy migration constructs.

**Transitional** — the OOXML vocabulary/profile retaining features used to
migrate and interoperate with older Office document behavior.

**MCE** — Markup Compatibility and Extensibility, the rules for handling
namespaces/features a consumer may not understand.

**DrawingML** — shared OOXML vocabulary for drawings, shapes, pictures, themes,
charts, diagrams, tables, and related visual behavior.

**EMU** — English Metric Unit, the common integer coordinate unit used by
DrawingML. 914,400 EMUs equal one inch.

**Preservation anchor** — Tumbler source metadata retaining where unknown or
inactive content belongs during focused serialization.

**Semantic projection** — a normalized, supported view used to compare documents
across serializers or consumers.

**Repair** — a consumer modifying or removing content because it considers the
input damaged or inconsistent, often accompanied by an Office recovery message.

**Fixture** — a document or generated input with provenance and expected test
behavior.

**Oracle** — an independent source used to judge behavior, such as a standard,
validator, parser, Office application, or reference visual.

## Common Transitional namespace URIs

Prefixes below are conventional examples only.

| Conventional prefix | Namespace URI | Purpose |
| --- | --- | --- |
| `w` | `http://schemas.openxmlformats.org/wordprocessingml/2006/main` | WordprocessingML |
| `x` | `http://schemas.openxmlformats.org/spreadsheetml/2006/main` | SpreadsheetML |
| `p` | `http://schemas.openxmlformats.org/presentationml/2006/main` | PresentationML |
| `a` | `http://schemas.openxmlformats.org/drawingml/2006/main` | DrawingML main |
| `r` | `http://schemas.openxmlformats.org/officeDocument/2006/relationships` | Office-document relationship references/types |
| `pr` | `http://schemas.openxmlformats.org/package/2006/relationships` | OPC relationship markup |
| `ct` | `http://schemas.openxmlformats.org/package/2006/content-types` | OPC content types |
| `mc` | `http://schemas.openxmlformats.org/markup-compatibility/2006` | MCE |
| `wp` | `http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing` | Word drawing placement |
| `xdr` | `http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing` | Spreadsheet drawing anchors |
| `c` | `http://schemas.openxmlformats.org/drawingml/2006/chart` | Charts |
| `cp` | `http://schemas.openxmlformats.org/package/2006/metadata/core-properties` | Core properties |
| `dc` | `http://purl.org/dc/elements/1.1/` | Dublin Core properties |
| `dcterms` | `http://purl.org/dc/terms/` | Dublin Core terms |
| `xml` | `http://www.w3.org/XML/1998/namespace` | XML-defined attributes such as `xml:space` |

Strict documents use the corresponding Strict namespace and relationship URI
families. Do not rewrite between families using string substitution; use
schema/profile-aware mappings.

Microsoft extensions commonly use versioned namespaces with prefixes such as
`w14`, `w15`, `x14`, `x15`, `p14`, or `p15`. Prefix spelling is not guaranteed,
and newer versions continue the pattern. Route by namespace URI and capability
registration.

## Common conventional paths

These paths are useful for inspection, never a substitute for relationships.

| Purpose | Common path |
| --- | --- |
| Content types | `/[Content_Types].xml` |
| Package relationships | `/_rels/.rels` |
| Word main document | `/word/document.xml` |
| Word styles | `/word/styles.xml` |
| Word numbering | `/word/numbering.xml` |
| Workbook | `/xl/workbook.xml` |
| Worksheet | `/xl/worksheets/sheetN.xml` |
| Spreadsheet styles | `/xl/styles.xml` |
| Shared strings | `/xl/sharedStrings.xml` |
| Presentation | `/ppt/presentation.xml` |
| Slide | `/ppt/slides/slideN.xml` |
| Slide layout | `/ppt/slideLayouts/slideLayoutN.xml` |
| Slide master | `/ppt/slideMasters/slideMasterN.xml` |
| Themes | format-specific directory followed by `/theme/themeN.xml` |
| Media | format-specific directory followed by `/media/...` |

## Unit conversions

| Source unit | Conversion |
| --- | --- |
| 1 inch | 914,400 EMU |
| 1 point | 12,700 EMU |
| 1 millimetre | 36,000 EMU |
| 1 degree | commonly 60,000 OOXML angle units |
| 1 twip/dxa | 1/20 point; common in Word measurements |
| 1 half-point | 1/2 point; common in Word font sizes |

Always verify the simple type for a particular attribute. OOXML uses several
measurement systems, percentages, fixed-point values, and context-specific units.

## Identity reminders

- ZIP path is not relationship identity.
- Relationship ID is local to its source.
- XML prefix is not namespace identity.
- Worksheet name is not `sheetId` or part name.
- Slide list position is not slide file number.
- Shape non-visual ID has a defined scope; it is not a package-global ID.
- Style index/ID is a document-local reference, not a computed style.
- Shared-string index is storage identity, not cell text identity.
- Computed color is not source theme color identity.
