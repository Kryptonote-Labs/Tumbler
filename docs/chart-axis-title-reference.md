# Rich chart axis titles

Category, value and depth titles retain their individual DrawingML runs, theme
fonts, colours, script positioning, character spacing and text decorations.
Their native `spPr` uses the same solid, gradient, pattern, picture and outline
renderer as other fitted chart text boxes. Rotation and manual layout move the
text and its painted frame together.

Automatic layout measures the complete rich title, rather than flattening it
into the first run's style. Depth titles use a horizontal default. Other axis
titles follow the physical axis orientation, including horizontal bar charts.
The reservation and renderer use one rotation rule. LibreOffice's
[TitleHelper](https://github.com/LibreOffice/core/blob/master/chart2/source/tools/TitleHelper.cxx)
sets default title rotation independently of the projected 3-D axis spine.

An axis title remains visible when its native axis spine is deleted. LibreOffice
reference conversions confirm this in Cartesian, XY, 3-D and contour samples.
Combination charts paint a shared title once per native axis ID, independently
of whether its spine is visible. Radar source titles remain preserved; the
LibreOffice radar samples do not display them.

## Validation

```sh
bun scripts/generate-chart-axis-title-fixtures.ts /tmp/chart-axis-titles/input
bash scripts/validate-openxml.sh /tmp/chart-axis-titles/input/*.docx /tmp/chart-axis-titles/input/*.pptx /tmp/chart-axis-titles/input/*.xlsx
```

The generator produces 28 axis-title cases in each of Word, PowerPoint and
Excel. All 84 packages passed Open XML SDK validation. Thirteen representative
LibreOffice conversions covered all three hosts, hidden axis spines, contour
titles and radar title visibility.

The 26 focused text tests cover strict and transitional parsing, rich fonts,
decorations, cached worksheet text, manual positions, default depth-title width,
automatic title/legend separation, hidden spines and shared combination axes.
Broad tests and type checks run in CI. The local type check reached the 600 MiB
resource cutoff before completion.

These checks establish retained formatting and native visibility behavior.
The text-box metrics and manual rotated-anchor differences recorded in
[the text-box reference](chart-text-box-reference.md) still apply; this layer
does not establish full text pixel parity.
