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
uses an explicit backdrop when supplied. Without one, export retains the complete
native ink and removes the stale bitmap fallback. An isolated bitmap cannot encode
a destination-dependent operation; assuming white would change the drawing.
Consumers without native ink support consequently have no bitmap preview for that
edited object. Other regeneration failures leave the package unchanged.

## Rendering choices and remaining interoperability proof

Office specifies curved versus linear strokes but not its fitting algorithm or
pressure transfer function. The Word profile uses the Windows ink Bézier fitter,
adapted from the MIT-licensed .NET WPF implementation. The generic InkML profile
uses an interpolating cubic with sharp-turn preservation and scales pressure linearly. The Word profile
uses a pressure multiplier of `0.25 + 1.5 * normalizedPressure`, measured against
desktop Word LTSC 2024. These choices do not establish pixel parity. Nib sweep polygons and raster coverage are
numerical approximations controlled by curve tolerance and raster scale.

The native coordinate mapping fits the physical ink bounds into the DrawingML
frame before applying flips, rotation and offset. Curved ink uses its fitted
centreline bounds, including analytic extrema. Word fits the resized samples in
the local frame before rotating them. Pen dimensions stay physical
when that frame scales; rotation and reflection still affect the pen. Word round
pens use a circle with the larger brush dimension. Rectangle pens retain both
dimensions. The editing/layout frame excludes pen thickness; the rendered ink
can extend beyond it. Resize regenerates an existing bitmap fallback with those
same pen semantics while retaining the original InkML bytes. A degenerate axis uses one
HIMETRIC unit, matching the inspected Word dot frame. Word's rewritten samples and PDF coordinates lose precision through integer
HIMETRIC conversion. Tumbler preserves the source samples instead of reproducing
that lossy rewrite. Eight desktop Word curve comparisons, including 30° rotation
and nonuniform resizing, have a maximum control-position difference of 0.109 pt;
centreline tests require error below 0.15 pt in both directions. This establishes
bounded agreement on the captured corpus, not universal pixel identity.

The canvas page painter reads the real destination pixels. `WordInkPageLayer`
connects that painter to Svelte and Kryptonote pages, composing destination-dependent
strokes against the page's text, images and other drawings. It overlays only changed
pixels and suppresses the isolated cached image only after the complete replacement
is ready. Failed or cancelled renders keep the cached image visible. Image decode
failures outside the affected tiles do not prevent ink from rendering.

The overlay renders disjoint affected-region tiles of at most 256×256 pixels.
`WordDocumentView.inkMaxPixels` bounds retained pixels per page, defaults to
1,048,576, and accepts positive integers up to that limit. Resolution is capped at
four device pixels per point and reduced further until all affected tiles fit.
Mounted overlays share a 4,194,304-pixel reservation pool, including two scratch
tiles per page. If the pool is full even at reduced resolution, the overlay reports
an error and retains the fallback. Each tile keeps the ink raster budget finite,
reads only its destination rectangle, and yields before the next tile so page
changes can cancel pending work. These limits do not alter stored ink samples.

`paintWordPage` also accepts a `viewport` in integer device pixels for cropped
canvases. It translates page painting and clips native ink pixel reads to that
viewport. `wordPageImages(page, regions)` optionally restricts image decoding to
rectangles in page points. Standalone canvas callers retain their existing
`inkMaxPixels` setting; the Svelte overlay never passes `Infinity`.

Selected ink exposes an Edit points control. Pointer drags and keyboard nudges use
the same headless sample operation, retain non-coordinate channels, and preserve
untouched sample positions when the bounds change. The drawing's layout frame stays
fixed. Each gesture commits one collaborative undo transaction in Kryptonote.
Trace overrides use source trace indices so recognition-cache removal cannot change
the identity of subsequent edits. Native DOCX and fallback updates remain atomic.

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

## Curve and point-edit reference run, 2026-10-18

Word LTSC 2024, build 16.0.17932, opened and saved the point-edited native DOCX,
exported PDF, and applied a 30° rotation with 1.4× horizontal and 0.7× vertical resize.
The unrotated saved round trip retained the moved sample at (-20, 15) pt and the
untouched sample at (80, 60) pt, relative to the original drawing origin.

Eight synthetic Word curve documents covered smooth, corner, repeated and sparse
samples with fitToCurve enabled and disabled. Their PDF Bézier controls exposed
the previous interpolating-curve and fit-after-rotation errors. The committed
`word-curve-reference.json` contains only synthetic coordinates and transforms.
`windows-curve-reference.json` contains 80 deterministic cases captured with
`scripts/capture-windows-ink-curves.ps1`; those controls match to 1e-6 HIMETRIC.

The fitter was adapted from [dotnet/wpf Bezier.cs and CuspData.cs](https://github.com/dotnet/wpf/tree/65d15adece1df9a73e3d1abc11f8bbf99e9fc7a9/src/Microsoft.DotNet.Wpf/src/PresentationCore/MS/internal/Ink).
Its MIT notice is included in the ink package. The PDF checks test the page renderer
rather than merely comparing two ports of the same algorithm.

The Open XML SDK Office 2010 validator accepted the point-edited native and fallback
packages, the edited destination-dependent package, and all eight curve probes.
Word opened and saved both final fallback and destination-dependent exports and
applied the rotation/resize control. LibreOffice 25.2.3.2 on the Pi converted both
point-edit controls to PDF; its output retained the regenerated fallback image but
contained no native-only ink. Native Word interoperability and LibreOffice fallback
coverage are therefore separate results.
