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
preservation. The generic InkML profile scales pressure linearly. The Word profile
uses a pressure multiplier of `0.25 + 1.5 * normalizedPressure`, measured against
desktop Word LTSC 2024. These choices do not establish pixel parity. Nib sweep polygons and raster coverage are
numerical approximations controlled by curve tolerance and raster scale.

The native coordinate mapping fits the physical sample bounds into the DrawingML
frame before applying flips, rotation and offset. Pen dimensions stay physical
when that frame scales; rotation and reflection still affect the pen. Word round
pens use a circle with the larger brush dimension. Rectangle pens retain both
dimensions. The editing/layout frame excludes pen thickness; the rendered ink
can extend beyond it. Resize regenerates an existing bitmap fallback with those
same pen semantics while retaining the original InkML bytes. A degenerate axis uses one
HIMETRIC unit, matching the inspected Word dot frame. This minimum and the exact
Word source-bounds rounding still need comparison against the captured Word corpus. The
Office profile does not itself establish those details. Synthetic matrix tests
prove the transform math, not Word's intrinsic bounding-box convention.
Rotation and nonuniform resizing operate on Word's local editing frame, not the
painted outer box. The reference run exercises both, but exact rewritten sample
rounding and curve-fitting parity remain unproven.

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

## Desktop Word reference

On 2026-10-18, Office LTSC Professional Plus 2024, version
`16.0.17932.20910`, opened all eleven corrected DOCX controls as native ink,
saved DOCX round trips, and exported PDFs. The same run rotated each drawing
30 degrees, multiplied its Word width by 1.4 and height by 0.7, and saved a
second DOCX and PDF. All eleven cases completed. The unedited native fixture's
PDF visibly contains the expected diagonal stroke. The remaining outputs need
comparison against Tumbler before claiming rendering or resize parity.

The first desktop run found a fixture defect that both schema validators missed:
a referenced brush inside `context` caused Word to reject the document. Moving
that brush directly under `definitions` made the fixture open. The positive DOCX
controls now use that placement. `invalid/nested-brush.docx` retains the rejected
case as a Word interoperability negative control; it is not an XSD negative test.
The standalone InkML corpus still includes the nested placement to exercise the
reader's preservation of W3C-valid inputs.

To reproduce, copy the generated positive DOCX files into an empty reference
directory's `input` subdirectory on Windows. Open a blank document in desktop
Word, identify its PID with `Get-Process WINWORD`, and run from that interactive
desktop session:

```powershell
.\scripts\capture-word-ink-reference.ps1 -Root C:\InkReference -WordProcessId <pid>
```

The script requires an empty `output` directory, attaches to the selected visible
Word instance, and closes only the test documents it opens. It writes a report,
PDFs, round-trip DOCX files and rotated/resized DOCX files. It uses explicit COM
argument types and the selected window's native object model: an unqualified
`GetActiveObject` attached to a different background Word instance during setup.
Word-generated packages can contain machine/user metadata; inspect and sanitize
them before committing any reference artifact.

LibreOffice can check the regenerated bitmap, but is not a native InkML oracle:
the inspected version discarded native ink during DOCX round trips. A local Word
reference file successfully exported with the failed request's geometry while
preserving InkML bytes; a stroke edit also reopened. That local replay does not
establish the state of the live production document service or Word visual parity.

## Cross-application reference results, 18 October 2026

Word LTSC 2024, version 16.0.17932.20910, opened all eleven positive packages
as native ink, exported PDF, saved DOCX, then rotated and nonuniformly resized
them. Ten additional ellipse, rectangle, pressure and degenerate-axis probes
completed the same run. PDF vectors and an editor screenshot established the
physical pen and pressure behavior described above. Word rounds sample extents
when it rewrites InkML; exact HIMETRIC rounding remains unresolved.

LibreOffice 25.2.3.2 on the Raspberry Pi converted all eleven packages to PDF
and DOCX. Native-only ink disappeared, and none of its saved DOCX files retained
InkML. The supplied bitmap fallback remained visible. This run therefore checks
fallback interoperability, not native ink semantics.

The Kryptonote server canvas omitted ImageData colour-space metadata and rejected
the browser-specific fifth getImageData argument. The page painter now uses the
shared four-argument form, accepts implicit sRGB, and rejects explicit display-p3.

Kryptonote's isolated preview selected and resized native-only ink and ink with
a cached preview. Both passed browser checks for eight resize handles, three
collaborating editors and undo. The product Download action produced DOCX files
after a 1 pt move and 10 pt width increase on the native-only control, and a
10 pt width increase on the fallback control. Both passed the Microsoft Open XML
validator, retained byte-identical InkML, and opened as native editable ink in
desktop Word. Word saved, rotated, resized and exported PDFs from both downloads.
LibreOffice on the Pi rendered the fallback download. The original private
failed geometry request also passed a local export replay; production was not
changed.
