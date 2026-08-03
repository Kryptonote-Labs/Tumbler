# OPC implementation status

This file maps the implemented package transaction boundary to ECMA-376 Part 2.
The vendored fifth-edition text in
`docs/reference/vendor/markdown/ecma/` is the normative local reference.

## Implemented requirements

| Requirement | ECMA-376 Part 2 | Implementation evidence |
| --- | --- | --- |
| Legal, equivalent logical part names | §6.2.2 | `part-name.ts`, content-type and package tests |
| UTF-8/UTF-16 infrastructure XML without DTDs | §§6.2.5, 7.2.3 | bounded XML parser and hostile XML tests |
| Default/Override precedence and uniqueness | §§7.2.3.2–7.2.3.5 | content-type parser and mutation tests |
| Case-insensitive extension and media-type matching when adding a part | §7.2.3.4 | generated content-type mutation tests |
| Package and part relationship naming | §§6.5.2.2–6.5.2.3 | relationship-name and package-invariant tests |
| No relationships from or to relationship parts | §6.5.2.1 | package and transaction invariant tests |
| Source-scoped unique relationship IDs | §6.5.3.4 | parser and transaction duplicate-ID tests |
| Internal target resolution and external target opacity | §§6.4, 6.5.3.4 | relationship resolution and transaction tests |
| New parts receive a resolvable media type | §7.2.3.4 | add-part transaction and reopen validation |
| Output package graph contains no dangling internal target | §§6.5, 7.2 | incoming-reference and final-graph validation tests |

## Transaction contract

`PackageTransaction` stages changes against an immutable `OpcPackage`:

- replacements copy caller-owned bytes;
- additions validate logical identity and media type during commit;
- removals reject surviving incoming relationships;
- deleting a source also deletes its relationship part;
- relationship edits retain order and IDs unless explicitly changed;
- adding the first relationship creates the correctly named relationship part;
- removing the final relationship removes that relationship part;
- `[Content_Types].xml` is rewritten only when its semantic mappings change;
- untouched ZIP entries retain their exact compressed payload;
- an empty transaction returns the original byte object;
- commit status changes only after the emitted package and relationship graph
  reopen successfully.

The package transaction is intentionally below the future user-facing editing
history. It provides atomic physical-package changes; `@tumblerjs/core` will own
document commands, undo, redo, revisions, and UI-facing events.

## Deliberate gaps

- ZIP64, interleaved parts, ZIP extra-field preservation, and data descriptors
  need dedicated implementation work.
- Relationship-part markup compatibility extensions are not yet preserved; the
  loss-aware OOXML/MCE layer is Phase 2.
- Adding a part currently uses an exact Override when no matching Default exists.
  It does not optimize the package by inventing a new Default shared by many
  additions.
- Digital-signature invalidation diagnostics are not implemented.
- Real Microsoft Office, LibreOffice, Open XML SDK, and Apache POI validation is
  still required. Those tools and a licensed fixture corpus were not available
  in the local environment, so generated packages are structural evidence, not
  yet interoperability certification.
