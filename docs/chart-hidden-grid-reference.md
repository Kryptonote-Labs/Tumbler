# Hidden axes and gridlines

Deleting a value axis hides its spine, tick marks, numeric labels and display-unit
label. Its independently authored major and minor gridlines remain visible.
Axis titles already have their own visibility rules. This applies to categorical,
XY, 3-D and radar scenes; a shared combination axis paints each grid set once.

Radar minor grids use the authored minor unit and line style. A hidden tick-label
setting suppresses radar numbers without suppressing grid polygons. Explicit
no-fill strokes continue to hide their own grids.

## Native references

```sh
bun scripts/generate-chart-hidden-grid-fixtures.ts /tmp/chart-hidden-grid/input
bash scripts/validate-openxml.sh /tmp/chart-hidden-grid/input/*.docx /tmp/chart-hidden-grid/input/*.pptx /tmp/chart-hidden-grid/input/*.xlsx
```

All 24 visible/hidden-axis packages pass Open XML SDK validation. The fixtures
use red major grids and green minor grids, an explicit 0–5 scale, major unit 1
and minor unit 0.5. LibreOffice 26.8.2.2 converts all four hidden-axis PowerPoint
references and retains both grid sets while omitting their axis numbers.

| Family | Native reference evidence |
| --- | --- |
| Column | Six red and five green strokes; category labels remain |
| XY scatter | Twelve red and ten green strokes across both hidden value axes |
| 3-D column | Red and green wall grids remain in the rendered PDF image |
| Radar | Six red and five green polygon strokes; category labels remain |

Focused checks cover ten classic plot elements through the shared rendering
paths, explicit grid visibility/no-fill, shared combination axes, title
independence, and radar tick-label settings. These establish visibility and style
behavior, rather than complete plot-layout pixel parity. Category- and
series-axis grid generation needs separate comparison.

## Dense radar grids

Regular radar polygons whose maximum radial deviation from a circle is at most
0.1 CSS pixel use two arc commands instead of one vertex per category. The path
starts at the top category so dashed strokes retain their phase. This avoids
generating millions of coordinates for dense grids in ordinary chart frames.

Grid work is checked before allocating polygon coordinates, using the existing
preview work budget. An extreme frame that still exceeds that budget uses the
existing unavailable-preview result. Its chart source, authored units and editing
operations remain intact. A focused test exercises the compact path and the
preallocation guard with a small source model; local validation stays within
600 MiB and 40% of one CPU.
