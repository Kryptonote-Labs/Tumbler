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

The shared scene builder renders ellipse/rectangle nibs, pen switches, pressure,
rotating tips, line segments and fitted curves. Pressure scales nib dimensions
linearly; curve fitting uses interpolating cubics with cusp preservation. Office
does not prescribe either algorithm, and this does not claim pixel parity with
Word. Transparency is applied once to the union of each stroke's coverage.

`renderOfficeInkSvg` handles destination-independent pens. `renderOfficeInkRaster`
implements all sixteen Office raster operations against supplied RGBA destination
pixels or an explicit background. It never assumes a white backdrop for XOR or
highlighter operations. Raster output can be encoded with `encodeInkPng` without
browser or platform codecs. The raster renderer accepts an affine `transform`.

`channelDefaults` supplies device calibration omitted from the file; explicit
file properties take precedence. `relativeUnits` supplies physical em/ex sizes.
The default point budget is 100,000, including curve expansion; the default raster
budget is 4,194,304 pixels. Both accept `Infinity`. Exhaustion returns a resource
diagnostic without discarding source samples.

`ink.recognition` exposes Office EMMA contexts and ordered alternatives, with
recognition diagnostics separate from geometry errors. Sample edits invalidate
ancestor recognition caches while retaining unrelated groups and metadata.
Embedding applications must still regenerate their cached previews; Word's
`replaceInkTrace` performs that package transaction.

This is **not a fully conforming W3C InkML processor**. General InkML streaming
contexts, canvas mappings, MathML and trace views are outside the Office reader.
See [the conformance matrix](../../docs/ink-conformance.md) for tested behavior and
remaining work. The package is registered for the next lockstep release; adding
the package does not publish it.
