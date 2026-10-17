# @tumblerjs/ink

Shared InkML decoding, lossless source editing and Office ink rendering. This
package depends on `@tumblerjs/ooxml`, with no Word, Slides, Sheets or UI dependency.
The format packages own package relationships, placement and cached previews.

```ts
import {
  readOfficeInk,
  renderOfficeInkSvg,
  replaceOfficeInkTrace,
} from '@tumblerjs/ink';

const ink = readOfficeInk(bytes);
const preview = renderOfficeInkSvg(ink);
if (preview.supported) {
  // preview.svg and preview.bounds use physical points.
} else {
  // Keep the host document's cached preview. Inspect preview.diagnostics.
}

const stroke = ink.traces[0];
if (stroke) {
  const edited = replaceOfficeInkTrace(ink, stroke.elementId, stroke.points);
  const output = edited.source.originalBytes();
  // The host must also regenerate its preview and update the drawing bounds.
}
```

`readOfficeInk` implements the Office profile in MS-ODRAWXML §2.1.4. It preserves
the complete source, including unrecognized metadata. Bad trace references,
duplicate IDs and samples produce diagnostics; malformed XML throws. ID uniqueness is checked across all namespaces, and ambiguous
references never select an arbitrary target. Declared-range violations use a
separate `range` diagnostic and are not clamped. Nothing fetches external
references. Callers can configure the shared XML parser's
resource limits.

`decodeInkTrace` and `encodeInkTrace` implement the W3C trace grammar independently
of the Office profile. Points follow declared channel order. Missing intermittent
values are `null`; booleans remain booleans. Integers must fit JavaScript's safe
integer range, and decimal/double samples use finite IEEE-754 numbers.

The SVG renderer supports explicit physical resolutions, ellipse and rectangle
tips, linear pressure scaling, pen switches and per-stroke transparency. It
returns diagnostics for unsupported rendering instead of omitting those strokes.
Synchronous SVG generation defaults to a 100,000-point work budget. Override it
with `renderOfficeInkSvg(ink, { maxPoints })`, including `Infinity` for an unlimited
preview. Exceeding the budget produces a `resource` diagnostic before SVG
allocation; it does not reject or truncate the source or decoded samples.
It does not reproduce Word's proprietary curve fitting or pressure transfer.
`applyInkRasterOperation` exposes all 16 Office RGB raster operations for raster
consumers; destination-dependent operations cannot be represented by this SVG
renderer.

This is **not a fully conforming W3C InkML processor**. General InkML streaming
contexts, canvas mappings, MathML and trace views are outside the Office reader.
See [the conformance matrix](../../docs/ink-conformance.md) for tested behavior and
remaining work. The package is registered for the next lockstep release; adding
the package does not publish it.
