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

The current read-only subset covers clustered bar/column, line, pie, doughnut,
numeric XY scatter, and two-dimensional bubble charts. Bubble series pair sparse
X, Y, and size caches by point index and support the standard area/width size
modes, 0–300% scaling, and opt-in negative values. Deterministic headless layout
is available through `layoutBubbleChart`.

`layoutChartScene(model, width, height, options)` lays a supported chart out as
drawing marks (rects, circles, SVG paths, crisp lines, styled text and clip
groups) in CSS pixels. The Svelte head renders these marks as SVG and
`paintChartScene(context, scene, d => new Path2D(d))` paints them on any Canvas 2D
context, so editor charts and rendered previews agree. Pass `measureText` to centre
legends with real text widths; otherwise widths are estimated.

Hosts can bind document colours through `model.themeColors`; `resolveChartColor`
resolves these bindings while preserving authored scheme references. Word imports
bind their document theme for all chart views.

Bar and column layouts honour authored `gapWidth` and `overlap`, including
negative overlap. `layoutBarBand` shares this geometry between standalone and
combination charts.

Chart text retains font size, Latin typeface, bold/italic flags and solid colour;
Word binds theme Latin fonts. Axis and major-gridline strokes retain `noFill`,
solid colour and width. Luminance modulation/offset transforms are resolved in
source order. Other text effects and colour transforms remain unsupported.

An existing chart title without text uses Office-compatible default text, or the
name of its single series. Pass `{ defaultTitle: "…" }` as the parser's third
argument to localize the fallback. An existing title takes precedence over
`autoTitleDeleted`, following MS-OI29500 §2.1.1431 and §2.1.1561.

Automatic Cartesian axes add headroom and round bounds to readable intervals.
This is a Word-parity policy, not an ECMA-prescribed automatic scale. Explicit
axis bounds and `majorUnit` take precedence; percentage stacks retain their
normalized bounds. Very dense grids sample whole major units for rendering.

Three-dimensional effects, per-point bubble formatting, data labels,
trendlines, error bars, and exact Office bubble-size normalization remain
explicitly unsupported. Unknown source XML is preserved by the owning OOXML
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
