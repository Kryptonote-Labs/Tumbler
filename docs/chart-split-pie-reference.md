# Split-pie layout

Pie-of-pie and bar-of-pie plots fit their primary and secondary plots together.
`secondPieSize` sets the secondary height as a percentage of the primary pie's
diameter, including the full schema range of 5 to 200 percent. The secondary
column is half as wide as it is high. `gapWidth` separates the plots as a
percentage of the primary pie's radius and defaults to 100 for Office split pies.
These percentages change the preview immediately through the same chart model
used by document canvases and rendered thumbnails.

The combined slice faces the secondary plot. Its generated category is `Other`,
which hosts can localize with `ChartSceneOptions.otherLabel`. Explicit point
labels still take precedence. Secondary labels retain their original category,
signed value and share of the whole source series. Bar segments stack from
bottom to top in source order.

Native `serLines` connects the combined slice to the secondary plot. Its paint,
width, dash, cap, join and gradient use the shared chart stroke renderer. Missing
or explicitly hidden series lines draw no connectors. New split-pie sources
include automatic series lines. Connector endpoints follow an exploded combined
slice, terminate at its edges for a small wedge, and use tangents for wider
wedges. The secondary pie's endpoints are tangent to its outline.

## Standards and native references

The gap interpretation and Office default follow
[MS-OE376 section 2.1.1494](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/9b53973a-1c02-4231-ad7c-02996b79021b).
The secondary size range follows
[ECMA-376 secondPieSize](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.secondpiesize?view=openxml-3.0.1).
The bar aspect ratio and wedge-edge/tangent connector behavior agree with
[LibreOffice's split-pie renderer](https://github.com/LibreOffice/core/blob/libreoffice-26.8.2.2/chart2/source/view/charttypes/PieChart.cxx).
The precise fit for variable gaps and sizes is Tumbler's interpretation of those
properties; Microsoft Office pixel comparison remains necessary to establish
that fit's pixel accuracy.

```sh
bun scripts/generate-chart-split-pie-fixtures.ts /tmp/chart-split-pie/input
bash scripts/validate-openxml.sh /tmp/chart-split-pie/input/*.docx /tmp/chart-split-pie/input/*.pptx /tmp/chart-split-pie/input/*.xlsx
```

All 36 packages pass Open XML SDK validation. Twelve cases exercise both split
variants with default layout, 50/150 percent secondary sizes, 0/200 percent gaps,
and category/value/percentage labels. Focused checks cover the full size/gap
ranges, plot fitting, source point colours, localized combined labels, bottom-up
bars, tangent geometry, connector styles, explosion and full-chart manual labels.

LibreOffice 26.8.2.2 converts both default variants, the 150 percent secondary pie
and the labeled secondary bar to PDF. Six source points allow it to draw both
plots. Its renderer falls back to an ordinary pie below four points; Tumbler does
not impose this LibreOffice-specific restriction on authoring.

The default pie and the 150 percent pie produce byte-identical 900-pixel-wide
reference PNGs. LibreOffice currently hardcodes secondary size and subplot
positions in
[PieChart.hxx](https://github.com/LibreOffice/core/blob/libreoffice-26.8.2.2/chart2/source/view/charttypes/PieChart.hxx).
These conversions therefore verify native packaging, split direction, bar order
and connector construction, but cannot establish variable-size/gap pixel parity.
LibreOffice also gives the combined slice its own automatic colour and omits its
generated category/value label in these fixtures. Tumbler retains the explicit
combined point colour and label. Explosion fitting and automatic outside-label
placement require further comparison.
