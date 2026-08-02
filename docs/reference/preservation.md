# Loss-aware XML and preservation

## Why ordinary XML models are insufficient

A conventional XML parser followed by an object model and generic serializer can
change or lose:

- unknown elements and attributes;
- namespace prefixes and declaration placement;
- comments and processing instructions;
- insignificant-looking whitespace that is significant to a producer;
- element and attribute ordering used by stable diffs;
- unselected MCE alternatives;
- extension containers;
- lexical forms of numbers, booleans, dates, and qualified names;
- empty-element spelling;
- entity/character reference spelling;
- XML declarations and encoding details.

Not all lexical differences affect OOXML semantics, but widespread rewrites make
data-loss detection difficult and can invalidate signatures. Tumbler needs an
editing representation that knows which source tokens own each supported value.

## Three-level representation

```text
Raw part
  original bytes and ZIP metadata
        ↓
Loss-aware XML tree
  token order, expanded names, prefixes, attributes, unknown nodes, source spans
        ↓
Semantic adapter
  paragraphs, cells, shapes, styles, relationships, commands
```

The semantic adapter references source nodes rather than replacing them. A dirty
semantic property maps back to the narrowest source mutation.

## Required XML node information

Candidate loss-aware nodes should retain:

- node kind;
- expanded name: namespace URI plus local name;
- original prefix and qualified spelling;
- ordered attributes with expanded and original names;
- namespace declarations and scope;
- ordered children including text, comments, and processing instructions;
- original source byte or character span where feasible;
- MCE context and active-view status;
- semantic owner/adapter identity;
- clean, locally dirty, descendant-dirty, inserted, or removed state.

Exact raw source slices are valuable because a clean subtree can be copied
without serialization.

## Parse modes

One parser can expose different modes without changing correctness:

- inventory: package and root discovery only;
- indexed/lazy: establish offsets and parse requested regions;
- semantic: build supported format adapters;
- validating: perform expensive structural checks;
- forensic: retain maximum lexical/source information for debugging.

Large worksheet and document parts may require streaming indexes rather than one
giant DOM. Lazy behavior cannot discard namespace or MCE scope needed by a later
region.

## Focused serialization

Serialization decision tree:

```text
clean part
└── preserve original part bytes

dirty XML part
├── clean subtree with safe source slice → copy source slice
├── dirty known node → serialize from updated source-aware node
├── unknown clean node → copy exact source form
└── inserted node → serialize using local namespace/style conventions
```

The writer needs a namespace allocator that:

- reuses an in-scope prefix for the desired URI;
- preserves existing prefix choices;
- avoids collisions and illegal rebinding;
- places a new declaration at the narrowest stable scope;
- understands QName-valued attributes whose values also depend on prefixes.

## Unknown content anchoring

Unknown nodes must remain attached to a stable structural owner and sibling
position. Avoid a global "unknown XML bag" because it cannot reconstruct where
content belonged.

Useful anchors include:

- before/after a known child role;
- exact ordered child index in the source-aware node;
- owning attribute set;
- extension-list entry with its URI;
- inactive MCE branch;
- related package part and relationship.

If a structural command deletes the owner of unknown content, the command must
have an explicit policy: delete with owner, reparent using a format rule, or
reject because safe behavior is unknown.

## Specified versus computed values

Never serialize computed presentation state as if it were source state.

Examples:

- Word run color may derive from a style and theme.
- Spreadsheet display text derives from raw value and number format.
- Slide fill may derive from a theme style and color transform.
- Layout coordinates may derive from master/layout inheritance.

Model both:

```text
specified value + provenance → computed value for rendering
```

Commands describe which specified layer to edit.

## Canonical semantic comparison

Tests need comparisons that ignore harmless lexical changes without hiding loss.
Canonical projections should be purpose-specific:

- OPC graph projection: parts, media types, relationships, bytes/hashes;
- XML projection: expanded names, ordered children, normalized namespace view;
- format projection: supported semantic model;
- visual projection: text and geometry.

Do not use one XML canonicalization pass as proof of complete equivalence. It may
erase exactly the distinction a producer or extension relies on.

## Dirty propagation

Dirty state should propagate narrowly:

```text
edited value
→ source element/attribute
→ containing XML part
→ package output
```

It should not automatically dirty:

- the entire format model;
- every related part;
- application/core properties;
- view state;
- all shared style or string records.

Shared resources require reference-aware handling. Editing a shared style should
either intentionally affect all users or clone and rebind the target object.

## Preservation failure policy

When Tumbler cannot prove an edit safe:

- expose a typed blocking diagnostic;
- identify the affected feature and source location;
- keep preview available if possible;
- allow download of the unchanged original;
- never silently continue with content loss;
- add the case to capability reporting and tests.

This is preferable to pretending partial format knowledge is full edit support.

## Preservation test examples

- no-op save with byte-identical parts;
- edit a Word text run while comparing every other ZIP entry;
- edit one cell while preserving unknown worksheet extensions;
- move one slide shape while preserving timing and notes;
- preserve unselected `AlternateContent` branches;
- preserve unfamiliar attributes on a known element;
- retain shared binary media referenced by multiple parts;
- save a macro-enabled package without executing or stripping VBA;
- detect signature invalidation before writing a changed signed part;
- open/save repeatedly until output converges.
