# InkML conformance and compatibility

`@tumblerjs/ink` provides the shared trace codec and an Office-profile reader.
Word uses it to expose native strokes and to draw supported ink when no usable
bitmap exists. A supplied Word bitmap remains preferred because it captures
Word's rendering choices. Slides and Sheets adapters have not been added.

The governing specifications are [W3C InkML 1.0](https://www.w3.org/TR/InkML/)
and [MS-ODRAWXML §2.1.4](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/096dacae-0d2c-4861-bc4d-c8e4c6405ad3).
Office supports a narrower profile and explicitly ignores several W3C features.
The public reader is named `readOfficeInk` to make that distinction explicit.

## Tested behavior

| Requirement | Behavior and evidence |
| --- | --- |
| W3C §3.2.2 trace compression | Independent absolute, first-difference and second-difference state per channel; mode changes, adjacent signed numbers, hex, exponents, trailing comma and wildcard integration. Golden examples plus 6,000 seeded generated cases. |
| Intermittent channels | Standalone codec supports defaults, omitted values, `*`, `?` and booleans. Office reader preserves them but disables native rendering because Office ignores their declaration. |
| Numeric types and bounds | Checks decoded ranges and integer samples; range violations have a distinct `range` diagnostic identifying the channel, point and value. Samples are never silently clamped. Unsafe integers and nonfinite numbers fail explicitly; arbitrary-precision numbers are not supported. |
| Office contexts and brushes | Explicit same-part references resolve by namespace and `xml:id`, including forward references. Duplicate IDs produce document-wide diagnostics and ambiguous references fail without discarding unrelated decoded traces. Contexts require definitions; brushes can be referenced elsewhere in the same part, including inside a context. Root-level brushes are accepted for compatibility; see the schema discrepancy below. Group inheritance is ignored as required by the Office profile. |
| Office trace placement | Reads traces directly under ink and recursively under traceGroup. Definitions traces and traceView are ignored by the Office profile. |
| Device channels | Retains channel order and unknown channels. Resolves channelProperties by channel name; rejects undeclared targets. Office time samples must be integer milliseconds. |
| Physical coordinates | Positive explicit resolutions in `1/cm` or `1/in` convert sample counts to points. No guessed device resolution. Missing or unsupported resolution keeps native rendering unavailable. |
| Brush properties | Profile defaults, invalid-value fallback, decimal dimensions, RGB color, transparency, rectangle/ellipse, antiAliased, fitToCurve and ignorePressure. |
| Raster operations | All 16 RGB truth tables tested independently. SVG supports copyPen and noOperation; other operations require a raster consumer and return a rendering diagnostic. |
| Geometry | Includes nib bounds, isolated dots, repeated points, variable pressure, pen switches and swept rectangle/ellipse segments. Transparency is applied once per stroke to avoid darkened joins. |
| Preservation | No-edit original bytes, UTF-8/UTF-16 source edits, unknown annotations and namespaces. Trace edits change only sample text and refuse to erase opaque markup. |
| Word integration | Supports Strict and Transitional host namespaces. Resolves internal customXml ink parts, retains native data with bitmap previews, generates SVG when supported without a bitmap, and preserves both representations through nearby text edits. Geometry changes remain guarded. |
| Invalid input | Namespace, duplicate ID, unresolved/external references, illegal trace syntax, channel counts, range overflow, DTD rejection and configurable XML resource limits. |

The renderer uses straight segments and scales nib dimensions linearly across the
declared pressure range. W3C leaves ink rendering algorithms to implementations;
this choice does not establish pixel parity with Word. Curve fitting, rotating
tips, arbitrary drawing transforms and destination-dependent raster composition
remain unavailable in the Word vector path. The source and cached preview remain
intact in these cases.

## Claims we do not make

The package is not a fully conforming W3C InkML processor under §8.3. It does not
implement general streaming context transitions, context inheritance, canvas
transforms, mappings or MathML, traceView slicing, continuation semantics outside
the Office profile, recognition interpretation, arbitrary-precision numbers or
all XML 1.1 handling. These remain required work before making that claim.
Preserving these constructs is not the same as interpreting them.

The Word vector preview fits sample-centre bounds to `wp:extent` independently
on X and Y, then expands the frame for the pen bounds. This is an approximation,
not a verified Word extent interpretation. It can stretch the ink when aspect
ratios differ. A zero-range axis uses the native physical scale. The supplied
Word bitmap remains preferred; synthetic fixtures test the implementation's
placement convention, not pixel parity with Word.

Synchronous SVG previews have a configurable 100,000-point work budget. The
renderer checks it before allocating per-sample SVG shapes. It never downsamples,
rejects the document or removes decoded samples. Use `maxPoints` in the shared
renderer or `openWordArtifact(bytes, { inkRendering: { maxPoints } })`; `Infinity`
disables the preview budget. Budget exhaustion produces a `resource` diagnostic,
available on `drawing.inkRenderingDiagnostics`. A raster fallback is preferred
before SVG generation. Large-part decoding and repeated imports still cost time
and memory; this guard bounds SVG generation only. Empty decoded traces do not
require a preview, but an unsupported nonempty stroke still prevents partial
rendering of the part.

Generated Word previews have no stored image `partName` or `relationshipId`.
`drawing.inkSource` identifies the original InkML part and relationship separately,
so generated image bytes cannot enter the media cache under an InkML part name.

The RGB helper follows MS-ODRAWXML's written operands for `maskNotPen` and
`maskPenNot`. Those two descriptions are reversed relative to the similarly
named Windows ROP2 constants. The distinction is tested explicitly; neither
operation is enabled in the Word SVG renderer, and native Word behavior for
these operations has not been independently established.

Word stroke editing is not exposed yet. The shared sample-edit API cannot update
an embedding document's fallback image or geometry automatically. A Word editing
operation must update all representations atomically before it can be enabled.

## Independent validation

Generate reproducible synthetic fixtures, then validate them using W3C's published
schema and libxml2 through lxml. All generated fixtures are authored for Tumbler
under MIT; no customer files or standards documents are committed.

```sh
bun test packages/ink/test packages/word/test/ink-fallback.test.ts
bun scripts/generate-ink-conformance.ts /tmp/ink-fixtures
bash scripts/fetch-inkml-schemas.sh /tmp/ink-schemas
# Requires Python lxml, CI uses 6.1.3.
python scripts/validate-inkml-schema.py \
  --schema /tmp/ink-schemas/inkml.xsd \
  --xml-schema /tmp/ink-schemas/xml.xsd /tmp/ink-fixtures/*.inkml
bun run compatibility:openxml -- --office2010 /tmp/ink-fixtures/native-only.docx /tmp/ink-fixtures/direct-native.docx
# This negative control must fail:
bun run compatibility:openxml -- --office2010 /tmp/ink-fixtures/invalid/transform.docx
```

The reader accepts root-level brushes because the Office reference rule only
requires a brush in the same part and W3C §7.2 describes top-level brush changes.
However, W3C §2.1's root grammar and the published XSD omit brush from the root
content model. Do not describe root-level brushes as unambiguously schema-valid.
Their compatibility test is separate from the XSD-positive fixtures; a brush
inside a context also proves the original definitions-only lookup was too strict.

The schema fetch checks fixed SHA-256 hashes. The validator supplies the XML
namespace schema location omitted by W3C's InkML schema; it does not change the
schema's constraints. It validates 214 source/edited documents. XSD validation
does not validate the trace text grammar, so the semantic tests are separate.
The SDK can skip an unrecognized alternate-content Choice. A second DOCX embeds
the selected ink directly, and an invalid transform control proves that the SDK
actually validates its native content. A successful check of the wrapper alone
would not establish that.

Local LibreOffice 24.2.7.2 testing found that a Word file displayed ink only while
its VML bitmap fallback was present. Removing that fallback left no ink pixels in
the ink region. DOCX round trips discarded the InkML parts in both cases.
LibreOffice is useful for checking the fallback but is not a native InkML oracle.
The native-only synthetic DOCX above allows this check without a private file.
Native SVG output was also rasterized with CairoSVG and inspected independently.
