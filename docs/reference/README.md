# OOXML engineering reference

This directory is Tumbler's offline working reference for implementing an OOXML
editor. It is written for engineers who need the important rules, structures,
and failure modes close to the code without repeatedly searching the web.

These notes are original summaries. They are not replacements for the normative
standards. When exact conformance language matters, follow the cited clause in
the official source.

## Reading order

1. [Standards and source map](sources.md)
2. [OOXML system model](system-model.md)
3. [Open Packaging Conventions](opc.md)
4. [Markup compatibility and extensions](markup-compatibility.md)
5. The format being implemented:
   - [WordprocessingML](wordprocessingml.md)
   - [SpreadsheetML](spreadsheetml.md)
   - [PresentationML](presentationml.md)
6. [DrawingML, themes, and shared visuals](drawingml.md)
7. [Loss-aware XML and preservation](preservation.md)
8. [Browser architecture and layout](browser-engineering.md)
9. [Security limits](security.md)
10. [Validation tools and corpora](validation-and-corpora.md)
11. [Implementation checklists](implementation-checklists.md)
12. [Glossary and namespace crib sheet](glossary.md)

For exact standards text and schemas, see the ignored
[local source archive](local-sources.md), recreated with
`bun run references:fetch`.

## Authority labels

Notes use these meanings:

- **Normative:** derived from a cited standards clause. Check the source before
  encoding a hard validation rule.
- **Office behavior:** documented Microsoft implementation or extension behavior.
- **Engineering policy:** a Tumbler decision made for safety, preservation, or
  maintainability.
- **Candidate:** something to prototype before adoption.

## Maintenance rule

When implementation work disproves or sharpens a note, update the note in the
same change. New compatibility bugs should add a fixture and a brief entry in the
relevant format reference.

Source review date: **2026-08-02**.
