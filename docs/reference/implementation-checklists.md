# Implementation checklists

These are working gates, not claims that checking boxes establishes complete
conformance.

## New parser dependency

- [ ] Browser-compatible and actively maintained.
- [ ] Strong TypeScript API without `any` contamination.
- [ ] License compatible with likely OSS distribution.
- [ ] DTD/external entities disabled or impossible.
- [ ] Configurable resource limits or cancellable wrapper.
- [ ] Preserves namespace URI, prefix, declaration scope, child order, comments,
      processing instructions, and unknown nodes as required.
- [ ] Handles large parts incrementally or proves acceptable memory behavior.
- [ ] Fuzzed against malformed input.
- [ ] Compared against DOM/SAX alternatives on representative files.
- [ ] Does not dictate Tumbler's semantic model.

## New ZIP dependency

- [ ] Inventories entries before inflation.
- [ ] Exposes compressed and uncompressed sizes.
- [ ] Rejects unsupported/encrypted entries predictably.
- [ ] Supports cancellation or bounded incremental work.
- [ ] Detects duplicate names.
- [ ] Allows raw copying of untouched entries, or the loss is accepted explicitly.
- [ ] Supports deterministic writing.
- [ ] Handles required ZIP64 cases.
- [ ] Benchmarked in browsers on all three formats.
- [ ] Survives bomb, traversal, and malformed-header tests.

## Adding an OOXML part handler

- [ ] Part discovered through relationship/content type rather than path only.
- [ ] Cardinality and allowed source/target constraints identified.
- [ ] Root expanded name checked.
- [ ] Strict and Transitional behavior identified.
- [ ] MCE and versioned extensions considered.
- [ ] Unknown content remains anchored.
- [ ] Lazy loading behavior defined.
- [ ] Incoming/outgoing relationship behavior defined.
- [ ] Delete/copy/rebind behavior defined.
- [ ] No-op and focused mutation tests exist.
- [ ] Open XML SDK validation passes.
- [ ] At least one independent consumer case exists.

## Adding an editable property

- [ ] Source and computed value are distinct.
- [ ] Inheritance/cascade context is documented.
- [ ] Typed command expresses user intent.
- [ ] Validation occurs before transaction commit.
- [ ] Dirty propagation reaches only required nodes/parts.
- [ ] Undo and redo retain exact semantics.
- [ ] Unknown attributes/siblings survive.
- [ ] Serialization reuses source conventions where practical.
- [ ] Property-based round-trip invariant exists.
- [ ] Visual or semantic fixture demonstrates behavior.
- [ ] External consumer retains the edit without repair.

## Structural command

Examples: insert worksheet row, delete Word section content, duplicate slide.

- [ ] All affected IDs and relationship scopes enumerated.
- [ ] Incoming and outgoing references enumerated.
- [ ] Names/formulas/ranges/timing/bookmarks affected by the operation identified.
- [ ] Shared resources cloned or retained according to reference semantics.
- [ ] Unknown owned content has explicit delete/reparent/block policy.
- [ ] Operation is atomic.
- [ ] Inverse/undo behavior tested.
- [ ] Metamorphic consequences tested.
- [ ] Large-document performance measured.
- [ ] Consumer round trip passes.

## Renderer feature

- [ ] Semantic node identity survives rerenders.
- [ ] Geometry uses source units until render conversion.
- [ ] Theme/style/inheritance provenance remains available.
- [ ] Missing font/resource behavior is defined.
- [ ] Accessibility name/role/focus behavior exists.
- [ ] Keyboard and pointer hit tests agree.
- [ ] Selection works across virtualization boundaries.
- [ ] Fixed-environment screenshot exists.
- [ ] Text and geometry assertions supplement pixels.
- [ ] Zoom, resize, scroll, and device-scale cases exist.
- [ ] Unsupported nearby content degrades locally.

## Fixture intake

- [ ] Source and checksum recorded.
- [ ] License/provenance recorded.
- [ ] Producer and version recorded when known.
- [ ] Feature labels recorded.
- [ ] Privacy classification recorded.
- [ ] Personal/customer data removed unless fixture remains private.
- [ ] Expected behavior defined.
- [ ] Original failure diagnostics retained.
- [ ] Fixture minimized where useful.
- [ ] No macro/embedded content reaches automated Office runners unexpectedly.

## Format vertical-slice release gate

- [ ] Capability matrix distinguishes recognize/preserve/render/edit/interoperate.
- [ ] No-op corpus has no unexplained part loss.
- [ ] Focused edits remain focused in package diffs.
- [ ] Structural and Open XML SDK validators pass.
- [ ] Apache POI and LibreOffice matrix passes or has visible bounded exceptions.
- [ ] Microsoft Office opens without unexplained repair.
- [ ] Property runs and fuzz budgets complete with retained seeds.
- [ ] Visual/interaction suite passes in pinned browser/font environment.
- [ ] Performance and memory stay within recorded budgets.
- [ ] Security corpus terminates within limits.
- [ ] Documentation and known unsupported behavior are current.

## OSS readiness gate

- [ ] APIs have evidence from more than one real integration or format slice.
- [ ] Package boundaries and names are stable enough to support semver.
- [ ] Dependency licenses audited.
- [ ] Fixture redistribution audited.
- [ ] Standards/schema redistribution audited.
- [ ] Kryptonote-specific UI separated from reusable head components.
- [ ] Security policy and reporting route documented.
- [ ] Capability/conformance reports are reproducible.
- [ ] Contribution guide explains fixture provenance and test expectations.
- [ ] Governance, license, package scope, and release process selected.
