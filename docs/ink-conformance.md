# Word Office InkML profile and integration

The target is Word's Office profile, not full general-purpose W3C InkML.
The normative sources are [MS-ODRAWXML §2.1.4](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/096dacae-0d2c-4861-bc4d-c8e4c6405ad3),
[Word contentPart](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/d2e49924-5c10-435d-9d6b-43321ef96ae3),
and the referenced [W3C InkML 1.0](https://www.w3.org/TR/InkML/) and DrawingML transform rules.

## Implemented behavior and evidence

| Area | Behavior | Evidence |
| --- | --- | --- |
| Trace grammar | Absolute, first/second differences, independent per-channel modes, adjacent signs, hex, exponents, wildcards, defaults and intermittent values | Golden W3C example and 6,000 generated streams checked against independent arithmetic/state-machine oracles |
| Office references | Explicit local context/brush references, forward references, namespace-aware IDs, ambiguity diagnostics | Reader tests with nested groups, definitions, duplicate/foreign IDs and external references |
| Office ignored constructs | No context/group inheritance, traceView evaluation or definitions traces; intermittent channels are retained but do not drive Office rendering | Profile tests; preservation is separate from interpretation |
| Calibration | Explicit physical X/Y resolutions; caller-provided device defaults when absent, without guessing hardware | Physical-unit and precedence tests |
| Brushes | Profile defaults/invalid-value handling, ellipse/rectangle, pressure, switches, OR orientation, transparency, curve fitting and anti-aliasing | Bounds, coverage, curve-budget and pixel tests |
| Raster operations | All sixteen Office RGB operations against destination pixels; per-stroke coverage union | Four-bit truth tables and mixed RGB destination tests including repeated samples |
| Recognition | Office EMMA context and confidence-ordered alternatives; separate recognition diagnostics | Context-only, alternatives, malformed-confidence and edit-invalidation tests |
| Drawing transforms | DrawingML off/ext, flips, clockwise rotation about frame centre; Strict and Transitional host namespaces | Independent corner-coordinate expectations, geometry/export tests |
| Native display | InkML takes precedence over the cached bitmap; SVG for destination-independent pens, raster page composition for all pens | Word reader and canvas pixel tests at several scales |
| Geometry edits | Native frame/transform/effect extents and VML placement/size updated together; inline/floating conversion | Host export tests using the failed request's dimensions and position, repeated placement tests, undo/redo |
| Stroke edits | Shared artifact/session API; samples and existing fallback updated atomically, shared parts copied, exclusive parts reused | Shared-target isolation, no-op/failure atomicity, repeated edits, undo/redo and independent PNG decode/CRC checks |
| Cache invalidation | Remove affected recognition and embedded `o:gfxdata` ink caches after sample changes | Ancestor/sibling recognition and package tests |
| Preservation | Unknown metadata, namespaces, unaffected parts and source encoding; no-op original bytes | UTF-8/UTF-16 and opaque-markup tests |
| Packaging | Internal customXml relationships, InkML content types, PNG relationships and content types | Microsoft Open XML SDK Office 2010 validation, including direct-native controls |

`replaceInkTrace` uses the declared device channel coordinates and retains the
existing native drawing frame. It changes the stroke geometry within that frame.
Drawing resize/placement is a separate operation. Existing fallbacks are rebuilt;
native-only documents remain native-only. Destination-dependent fallback rendering
requires an explicit backdrop. It is not safe to replace it with an assumed white
background. The operation fails before committing if regeneration cannot complete.

## Rendering choices and remaining interoperability proof

Office specifies curved versus linear strokes but not its fitting algorithm or
pressure transfer function. Tumbler uses an interpolating cubic with sharp-turn
preservation and linear pressure scaling. These choices are explicit; they are
not evidence of Word pixel parity. Nib sweep polygons and raster coverage are
numerical approximations controlled by curve tolerance and raster scale.

The native coordinate mapping fits the physical sample bounds into the DrawingML
frame before applying flips, rotation and offset. A degenerate axis uses one
HIMETRIC unit, matching the inspected Word dot frame. This minimum and the exact
Word source-bounds rounding still need a Microsoft Word reference corpus. The
Office profile does not itself establish those details. Synthetic matrix tests
prove the transform math, not Word's intrinsic bounding-box convention.
Nonuniform resizing of rotated drawings also needs additional interoperability
work: scaling the local extents is not generally the same as scaling an arbitrary
rotated outer bounding box.

The canvas page painter reads the real destination pixels. Image-only consumers,
including the current Svelte DOM view, cannot reproduce destination-dependent
raster operations. They retain an available cached preview and expose diagnostics;
without a cache they have no visible preview for those operations. Completing
native display in that view requires connecting it to the page raster painter.
Stroke mutation is exposed through the shared headless artifact/session API;
interactive stroke-point handles are not part of this change.

Device-dependent files need host calibration. Em/ex dimensions need host physical
unit sizes. The published InkML §6.4 defines `pc` as `1/22 pt`, unlike the usual
pica; the codec follows that text, but Word interoperability for this unusual unit
has not been established. All resource budgets are configurable and never remove
stored samples. JavaScript numeric representation remains finite IEEE-754, with
safe-integer checks for integer channels.

Full W3C §8.3 conformance is not claimed. General streaming contexts, inherited
canvases, affine/table/MathML mappings, traceView slicing and continuation outside
the Office profile remain separate work. Slides and Sheets adapters are separate.

## Independent package validation

Fixtures are synthetic and MIT-licensed. No customer documents or copied standards
examples are committed.

```sh
bun run check
bun test
bun scripts/generate-ink-conformance.ts /tmp/ink-fixtures
bash scripts/fetch-inkml-schemas.sh /tmp/ink-schemas
python scripts/validate-inkml-schema.py \
  --schema /tmp/ink-schemas/inkml.xsd \
  --xml-schema /tmp/ink-schemas/xml.xsd /tmp/ink-fixtures/*.inkml
bun run compatibility:openxml -- --office2010 /tmp/ink-fixtures/*.docx
# Negative control: must fail on the malformed native transform.
bun run compatibility:openxml -- --office2010 /tmp/ink-fixtures/invalid/transform.docx
```

The generator emits 214 InkML source/edited fixtures and eleven positive DOCX
controls, including native geometry edits, native stroke edits and a regenerated
VML fallback. Direct-native controls avoid the SDK skipping an unrecognized
AlternateContent choice. The malformed-transform negative control proves the
native transform is actually validated. Schema validation cannot validate trace
text semantics or visual output.

LibreOffice can check the regenerated bitmap, but is not a native InkML oracle:
the inspected version discarded native ink during DOCX round trips. A local Word
reference file successfully exported with the failed request's geometry while
preserving InkML bytes; a stroke edit also reopened. That local replay does not
establish the state of the live production document service or Word visual parity.
