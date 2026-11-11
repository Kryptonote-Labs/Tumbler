# `@tumblerjs/charts`

Headless OOXML chart semantics and deterministic layout shared by Tumbler's
document formats and UI heads.

> **Extremely early alpha.** Chart coverage and visual fidelity are incomplete,
> and APIs can change without notice.

```sh
bun add @tumblerjs/charts
```

```ts
import { parseOoxmlChart } from "@tumblerjs/charts";

const chart = parseOoxmlChart(chartXml, "transitional");
```

The shared preview covers bar/column, line, area, pie, doughnut, XY scatter,
bubble, radar, stock, split pie and surface charts. Cartesian and pie 3D plots
use authored camera settings. Box, cylinder, cone, pyramid and their axis-maximum
variants share projected geometry, point paint and outlines. Standard grouping
places series in depth; clustered grouping places series across categories.
Height/depth ratios, right-angle projection and perspective use the Office
implementation notes. Unauthored depth uses proportional cells as an automatic
layout policy. Authored walls retain paint and outward thickness. These layouts are under active compatibility work; this
is not a claim of pixel parity with Office or LibreOffice for every property. Bubble series pair sparse
X, Y, and size caches by point index and support the standard area/width size
modes, 0–300% scaling, and opt-in negative values. Deterministic headless layout
is available through `layoutBubbleChart`. Bubble sphere effects retain plot, series
and point precedence. Typed creation and gallery conversion use the series-level
flag required by Office; raw ECMA plot-level flags remain supported. SVG and
canvas share the shading, with authored gradients and no-fill retained. Automatic
XY bounds reserve the full bubble footprint, including logarithmic/reversed axes.
Explicit endpoints still clip exactly as authored. Relative bubble sizing is
independent of the units used for magnitudes, including fractions below one.

`layoutChartScene(model, width, height, options)` lays a supported chart out as
drawing marks (rects, circles, SVG paths, crisp lines, styled text and clip
groups) in CSS pixels. The Svelte head renders these marks as SVG and
`paintChartScene(context, scene, d => new Path2D(d))` paints them on any Canvas 2D
context, so editor charts and rendered previews agree. Pass `measureText` to centre
legends with real text widths; otherwise widths are estimated.

Picture fills retain embedded images, source crop, destination insets, opacity,
tiling, alignment, offsets and alternating flips. Native document readers resolve
image parts locally through `readChartModel`; portable `chartContentModel` resolves
the resource graph. External image URLs are never fetched. SVG and canvas share
the picture geometry with other DrawingML shapes. Stretched pie pictures use each
wedge's own bounds. Office ignores the stored `dpi` field, following MS-OI29500
§2.1.1288 and §2.1.1601; the source still retains it.

Canvas hosts enumerate `chartScenePictures(scene)` and decode those stable picture
identities before painting. Pass a fourth `paintChartScene` argument with
`picture(fill, width, height)` to draw a decoded image at the current origin; the
engine supplies the shape clip. `paintDrawingPicture` from `@tumblerjs/ooxml` paints
the shared source/crop/tile geometry. Word exposes `wordPageChartPictures` and
`WordPagePaintOptions.chartImage`; slides include chart fills in
`presentationSlideImages`. Canvas tiling has a configurable preview-work budget,
independent of stored source or authoring limits.

Hosts can bind document colours through `model.themeColors`; `resolveChartColor`
resolves these bindings while preserving authored scheme references. Word, slide
and spreadsheet imports bind their host template colours and Latin fonts, including
slide colour-map overrides.

Bar and column layouts honour authored `gapWidth` and `overlap`, including
negative overlap. `layoutBarBand` shares this geometry between standalone and
combination charts.

Chart text retains font size, Latin typeface, bold/italic flags and solid colour;
Theme Latin fonts follow the host document. Axis and gridline strokes retain
`noFill`, solid colour and width. Colours retain the DrawingML preset, system,
HSL, linear RGB and scheme choices, with ordered transforms and transparency.
These source choices survive title edits, including merged editor runs with
different opacity. Other text effects remain incomplete.

An existing chart title without text uses Office-compatible default text, or the
name of its single series. Pass `{ defaultTitle: "…" }` as the parser's third
argument to localize the fallback. An existing title takes precedence over
`autoTitleDeleted`, following MS-OI29500 §2.1.1431 and §2.1.1561.

Automatic Cartesian axes add headroom and round bounds to readable intervals.
This is a Word-parity policy, not an ECMA-prescribed automatic scale. Explicit
axis bounds and `majorUnit` take precedence; percentage stacks retain their
normalized bounds. Very dense grids sample whole major units for rendering.

Per-point fills, markers, line widths, smoothing and pie explosion are rendered.
Chart, plot, title and legend shape fills are independent; overlay titles retain plot space.
Authored preset/custom dash patterns, caps and joins reach SVG and canvas strokes.
Linear, radial and rectangular gradients retain theme colours and alpha transforms on
2D series, points, markers, labels, areas and legend swatches, including outlines.
Rectangular path gradients retain the full focus rectangle. Canvas hosts decode
the rectangular outline brushes returned by `chartScenePictures`; SVG uses vector
paint. Radial focus size, tiled/flipped gradients and effects still need renderer
work. Their XML remains editable, and native gradient colour interpolation still
needs separate visual comparison.
Data labels support value/category/series/percentage/bubble-size flags, custom text,
point deletion and number formats. Rich label text, leader lines, exact Office
bubble-size normalization remain incomplete. Three-dimensional bubble shading is rendered
when enabled at the plot, series or point.

Unstacked categorical and XY plots support linear, exponential, logarithmic,
polynomial, power and moving-average trendlines. Forecasts reserve visible domain
space; equation and R² annotations remain outside the clipped data geometry.
`fitChartTrendline` uses scaled QR fitting and the documented Excel 2104+ R²
convention. Error bars support fixed, percentage, sample deviation, standard error
and custom amounts, caps and direction. Custom error formulas refresh from live
source cells. Stacked errors use visible stack endpoints and normalize percentage
magnitudes. Combination bar/line/area plots share these rendering paths.
Stock plots use the same date/log/reversed projection and can share combination charts
with volume columns on separate axes. High-low lines, drop lines and up/down bars use
authored paint and gap widths; high-low-close ticks extend right from the price stem.
New three/four-series stock sources author the corresponding marker/bar defaults.
Surface height bands use independent theme colours and sparse `bandFmt` overrides,
including fills, gradients, outlines and no-fill. Legends describe value ranges.
3D wireframes follow source grid edges, while 2D wireframes follow interpolated
height contours. Shared contour edges paint once so authored alpha is preserved.

Value axes support logarithmic/reversed scales, crossings, minor grids/ticks,
label-side/skip settings and display units. Date categories preserve calendar gaps
and equal month/year units. Cartesian 3D axes share the data camera, crossings,
labels, value gridlines and ticks; hidden axes retain their scale. Surface charts
apply authored camera settings, with new contours using a top-down view. Manual
layout and several other axis properties still need compatibility work. Unknown source XML is preserved by the owning OOXML
package even when a chart falls back rather than rendering.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).

Automatic value-axis intervals in column, bar, line, and combination charts respond
to the plot's available length and the resolved tick-label font size. Resizing changes
the automatic grid density; document zoom does not. Explicit `c:majorUnit`, `c:min`,
and `c:max` values remain authoritative.

ECMA-376 Part 1 §21.2.2.103 defines [`majorUnit`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.majorunit#remarks) as the distance between major ticks;
§21.2.2.107–108 define the bounds. The standard does not prescribe the automatic
layout algorithm. Our density policy is checked against the supplied Word sample:
the 0–5 data displays 0–6 with unit gridlines at full height and 0, 2, 4, 6 when
compressed. This is reference-case compatibility, not a claim that every Word
version's automatic switching thresholds have been reproduced.

Cartesian category labels use measured text widths: crowded automatic labels rotate
45 degrees instead of dropping alternate categories. Authored `a:bodyPr/@rot`
values (including an explicit zero) override this choice; Word's `-60000000`
automatic sentinel is not rendered as a literal angle. Plot height is allocated
after title, category labels, and wrapped legend rows, so these areas affect automatic
value ticks together. The Word sample chart XML is retained as a focused fixture;
its 9pt labels are tested at original, short, and narrow dimensions.

`updateChartTitle(bytes, title)` accepts plain text or rich title paragraphs and
preserves the chart's layout, series, and data. Parsed `titleText` retains separate
runs, including their font, emphasis, colour, underline, strikethrough, highlight,
vertical alignment, and character spacing. SVG and canvas draw those runs through
the shared chart scene.

Word authored runs expose `chartTitleText` for rich titles (`chartTitle` remains
supported for plain-text callers). `WordDrawingView` hosts provide
`oncharttitletextchange` and the existing text-editor/selection/undo callbacks to
connect title editing to the same formatting controls as shape text. Double-click
the title or press F2 while the chart is selected. Edits apply as you type; Enter
adds a paragraph and Escape leaves text editing. Undo restores earlier changes.

Chart previews enforce resource limits independently of OOXML cache counts. Cache
indices must be below 100,000 even without `ptCount`; larger indices return an
unsupported chart so the host document can still open. Cartesian previews allow at
most 20,000 category positions and 20,000 total series/category cells, including
combination plots and sparse gaps. Preview input is also limited to 100,000 stored
points, 256 series/axes per plot, and 16 combination plots. Combination accounting
includes the root model and each plot. These are rendering budgets, not authoring or OOXML schema
restrictions; documents exceeding them cannot be previewed in full.

`layoutChartScene` returns a two-mark "Chart preview unavailable" scene when a
preview limit, invalid geometry, or host callback prevents rendering. This applies
to SVG and canvas consumers. Lower-level layout functions can still throw.
Per-layout point maps and stack positions are rebuilt on each resize or host edit.

Visible value axes render tick labels even when major gridlines are absent.
Deleted axes suppress labels, gridlines, and axis strokes. Cartesian, combination,
and XY ticks use the host `formatNumber` callback with the axis format code, falling
back to the series cache format and then an English numeric format preserving up to 21
significant digits, including distinct ticks below one millionth.

To compare the audit baseline with the current renderer using identical generated
fixtures and installed dependencies, run:

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock bash packages/charts/bench/compare.sh /tmp/chart-results
```

The JSONL files contain separate parse/scene timings, two warmups and five samples,
CPU/runtime metadata, heap deltas, scene hashes, and mark counts. A separate pass
counts cache-index reads with getters, outside the timed samples. Heap deltas are
observations of Bun's reported live heap, not total allocated bytes; zero deltas do
not imply zero allocation. Other processes that do not use the lock can still
contend for this shared host.

## Source authoring

`createOoxmlChart(options)` creates a chart XML part for any of the 16
ECMA-376 Part 1 §21.2.2 plot elements, listed in `OOXML_CHART_TYPES`.
It accepts Strict or Transitional conformance, titles, series, category labels,
XY values, bubble sizes and family-specific grouping/style options. Null data
points remain blank. Series colours use theme accent references; automatic pie
fills remain unassigned so slices can use the host palette. New axes explicitly
retain visibility in Office. Scatter gallery choices author series line, marker
and smoothing settings, and hidden lines retain their inactive paint. The `none`
creation option uses hidden series under `lineMarker`, because Office rejects the
ECMA `none` shortcut. Raw source editing still accepts that standard value. The caller
must attach the part to a host drawing. Source creation does **not** extend the
renderer coverage described above, create an embedded workbook, or bind sheet
formulas. Combination charts are composed of multiple plot elements and are not
created by this helper.

`inspectChartSource(bytes)` returns every element and attribute, including
Microsoft extension properties. `editChartSource(bytes, edits)` applies atomic
lexical edits by snapshot node ID, preserving unrelated source bytes. Supported
edits set/remove attributes, set leaf text, replace/remove elements, and insert
markup before or inside elements. Inserted markup must declare its namespaces
or use bindings already in scope. All addresses refer to the original snapshot;
overlapping edits fail. Hosts must guard the snapshot with a document revision
and reread after edits.

Source edits check XML well-formedness and the chart root, **not** OOXML schema
validity, formula correctness, or cross-part consistency. Use the sheet engine
and the same package transaction when changing referenced workbook data. This
low-level API keeps properties accessible before typed editing controls exist;
it is not a replacement for those controls.

Generate references with `bun scripts/generate-chart-authoring-fixtures.ts <dir>`.
This produces one PPTX and chart XML per plot element, retaining the reference
presentation's theme and layout. Validate PPTX files with the repository's
Open XML SDK validator and export them through LibreOffice for visual references.


`convertChartType` changes a selected plot without flattening its data bindings.
Compatible formatting stays active, and a private OOXML extension retains inactive
properties so they can return when switching back. Series identities keep their
formatting through reordering; newly added series do not inherit deleted series history.
`editChartSeries` adds, duplicates, removes or reorders series. Duplication copies the
current series, including its source ranges and formatting.

`chartPropertyTree` exposes the chart and DrawingML property definitions from the
pinned Open XML SDK schema. It supplies typed attributes, choices, numeric bounds
and available child properties for the shared editor. The source-edit API remains
available for extension properties. `readChart3DProperties(bytes, plotIndex)` resolves
view defaults independently of preview budgets for shared editor controls. Numeric
view controls preview drafts and commit on blur, with Escape cancellation. Mini
sheets retain referenced-range highlights; opening a missing embedded workbook
creates a local draft and saves it with the first edit. Metadata coverage does not establish renderer
coverage or semantic validity for arbitrary combinations of property edits.

The Svelte `ChartWorkbench` combines type previews, property fields, series/range
controls and a real embedded spreadsheet. DOCX and PPTX hosts serialize the chart
and workbook together; XLSX hosts edit their existing worksheet data.
Its collapsed Source XML editor supports extension properties, retains drafts across
collapse, and requires reloading before applying over a concurrent host edit.
The format target's Picture chooser attaches native image parts, preserves crop,
tiling and effects on replacement, and disconnects a replaced linked source.
`setChartPictureFill(content, snapshotNodeId, { data, contentType })` provides the
same operation to headless hosts and CLI picture edits. Use complete content from
`readChartContent` to retain other related parts. Removing a fill leaves resources
available for other references and inactive conversion history.

`ChartContent.resources` carries pictures, styles, user drawings and other related
parts as a portable graph. `parts` have unique keys, content types, base64 bytes and
optional relationships; root `relationships` belong to the chart. Internal targets
use part keys, or `$chart` for the owning chart. `fragment` is decoded text. External
targets remain URLs and are never fetched. The source workbook stays in `workbook`.
Omitting `resources` preserves existing parts. Supplying a complete snapshot replaces
the related relationships, preserving shared targets and cycles. Asset edits copy
related parts so another chart sharing an image retains its original bytes. Unchanged
graphs are reused. XML declarations and standard relationship types follow the host
conformance profile; embedded packages remain opaque.

CLI `charts read --part ...` returns the resource graph. `charts edit --input ...`
accepts `resources` and optional source `edits` in the same revision-checked operation.
Source node IDs always refer to the inspected source, including when worksheet caches
are stale. Generate native picture-resource fixtures with
`bun scripts/generate-chart-resource-fixtures.ts <dir>`.

Generate native authoring fixtures for all sixteen chart types across all three
formats with `bun scripts/generate-chart-editing-fixtures.ts <output-directory>`.
These fixtures exercise formulas, conversion history and series membership before
schema and LibreOffice validation. Schema validation and successful PDF conversion
are interoperability evidence; neither proves pixel parity.

`convertChartConformance` changes standard namespace declarations while retaining
literal text and extension namespaces. Native chart insertion and writes reconcile
these declarations with the owning package profile. Embedded XLSX packages retain
their own independent profile.

Generate native property references with
`bun scripts/generate-chart-property-fixtures.ts <dir>`. The fixture set covers all
six trendline types, five error amount modes, date categories, log/reversed axes,
axis crossings, ticks and display units in DOCX, PPTX and XLSX. Schema validation
and successful LibreOffice export establish interoperability evidence; visual
parity still needs separate measurement.

All 54 ECMA-376 pattern presets use shared native Office masks, including shaded
diagonal edges. SVG and canvas repeat complete RGBA tiles so opaque fills remain
opaque at fractional scale. `chartScenePictures` includes generated pattern tiles;
canvas hosts pass their decoded-image lookup as `ChartCanvasOptions.image`. The
existing `picture` callback still paints authored picture fills. `patternOrigin`
locates the chart in its parent brush coordinate space.

Generate the synthetic nine-page shape/chart atlas with
`bun scripts/generate-chart-pattern-reference.ts`. Export its native PDF, convert
each page with `pdftocairo -f N -l N -svg reference.pdf microsoft-N.svg`, then run
`bun scripts/derive-drawing-pattern-tiles.ts <svg-directory>` to reproduce the masks.
The shared PNG encoder also retains the existing `encodeInkPng` API.
