# Open Packaging Conventions

Primary source: ECMA-376 Part 2, especially §§4, 6–10 and Annex B.

## Abstract model

OPC separates a logical package from its physical ZIP representation. The
logical package is a collection of parts and relationships. ZIP entries are the
physical mapping. Keeping that distinction prevents ZIP-library behavior from
leaking into part identity.

Recommended internal identities:

```ts
type PartName = string & { readonly __partName: unique symbol };
type RelationshipId = string & { readonly __relationshipId: unique symbol };
type MediaType = string & { readonly __mediaType: unique symbol };
```

Branded strings are illustrative. Construction must go through validating
functions rather than casts.

## Part names and ZIP item names

Logical part names are URI-like absolute paths. ZIP item names are their archive
mapping and normally omit the leading slash.

Implementation rules to enforce or verify against Part 2 §6.2 and §7.3:

- normalize to one internal logical form;
- reject empty, root-only, or directory-like part names;
- reject dot segments and traversal attempts;
- treat names according to OPC equivalence rules, not OS filesystem rules;
- never pass a part name directly to filesystem path resolution;
- handle percent encoding according to OPC/URI rules;
- detect duplicate logical names even when archive spellings differ;
- keep the original ZIP item spelling/metadata for preservation diagnostics.

The parser must distinguish a malformed name from an unsupported convention. It
must not "fix" an unsafe name and continue under a different identity.

## Relationship parts

Relationships are stored separately from the source content.

| Source | Relationship item |
| --- | --- |
| Package | `/_rels/.rels` |
| `/word/document.xml` | `/word/_rels/document.xml.rels` |
| `/xl/worksheets/sheet1.xml` | `/xl/worksheets/_rels/sheet1.xml.rels` |

Each relationship has:

- `Id`, unique within that relationship part;
- `Type`, an absolute relationship-type URI;
- `Target`;
- optional `TargetMode`, with external targets treated differently.

Internal targets resolve relative to the source part under OPC rules. Package
relationships resolve from the package root. External targets are identifiers,
not package parts, and must not be fetched during parsing.

Engineering invariants:

- relationship identity includes its source;
- an internal relationship target resolves to an existing part unless the input
  is being represented as damaged;
- deleting a part checks incoming references;
- adding or copying a part assigns relationship IDs in the correct source scope;
- relationship order and ID spelling remain stable when untouched.

Relationship graphs may contain surprising shapes. Do not recursively traverse
without a visited set and budget.

## Content types

`[Content_Types].xml` associates part names with media types through:

- defaults keyed by file extension;
- overrides keyed by complete part name.

Resolution should be explicit and diagnostic:

```text
override for exact part → extension default → missing content type error
```

When adding a part, reuse an existing correct default when safe; otherwise add an
override. When removing a part, do not remove a default or override still needed
by another part. Preserve unfamiliar media types.

The content-types item and relationship items are package infrastructure, not
ordinary application parts.

## ZIP mapping and preservation

The ZIP library must expose enough information to:

- inventory entries before inflation;
- reject suspicious sizes and ratios;
- read raw compressed bytes or preserve untouched entries without recompressing;
- distinguish stored and deflated entries;
- retain CRC and relevant metadata where possible;
- write deterministic output;
- detect duplicate entry names;
- avoid extracting to disk.

Tumbler's preferred save behavior is copy-on-write:

```text
clean entry   → copy original compressed representation
dirty XML     → serialize and compress replacement
new part      → serialize/compress and add content type/relationships
removed part  → omit only after reference checks
```

If the chosen ZIP library cannot copy raw entries, measure how much no-op output
changes and decide whether a lower-level writer is required before committing to
it.

Consult Part 2 Annex B before encoding assumptions about ZIP flags, headers,
extra fields, data descriptors, ZIP64, encryption, or unsupported compression
methods.

## Core properties

The Core Properties part can carry values such as title, subject, creator,
keywords, description, last modifier, revision, creation time, modification
time, category, identifier, language, version, content status, and last printed
time.

Editing ordinary document content should not arbitrarily rewrite metadata.
Product policy decides which fields change on save. Dates require correct typed
XML handling and timezone preservation where present.

## Thumbnails

An OPC package may contain a thumbnail related from the package. Tumbler can
preserve it initially. If edits make it stale, policy must choose between
retaining, removing, or regenerating it; silent regeneration is not part of the
core save path.

## Digital signatures

OPC defines signature origin, XML signature, and optional certificate parts plus
a relationship transform. Any change to signed content can invalidate a
signature even when the document remains otherwise valid.

Initial policy:

- detect signature-related parts and relationships;
- expose signature presence and affected-save diagnostics;
- preserve signatures on a no-op save;
- never claim a signature remains valid after a mutation without validation;
- do not implement signing until canonicalization and threat modeling receive a
  dedicated design.

## Error categories

Useful typed errors include:

- invalid archive;
- archive limit exceeded;
- duplicate item;
- invalid part name;
- missing content type;
- malformed relationship part;
- duplicate relationship ID;
- missing internal relationship target;
- unsupported compression or encryption;
- malformed core property;
- signature present or invalidated.

Keep the original part or item name and source relationship in diagnostics.

## First implementation acceptance tests

- Inventory representative DOCX, XLSX, and PPTX packages.
- Find each package's main office-document part through relationships.
- Resolve relative internal targets and preserve external targets.
- Reject traversal and duplicate-name fixtures.
- Enforce compressed/expanded size budgets before allocation.
- Perform a no-op round trip with untouched entry preservation.
- Add and remove a synthetic part while keeping content types valid.
- Pass the OPC portions of Open XML SDK validation.
- Survive mutation fuzzing without crash, hang, or unbounded memory.
