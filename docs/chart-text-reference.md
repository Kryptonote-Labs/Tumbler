# Chart text placement reference checks

Manual layout now moves chart titles, axis titles, individual data labels,
trendline labels and display-unit labels in the shared SVG/canvas scene. Rich
point and analytical labels retain separate run fonts, script baselines,
character spacing, highlights and text decorations. Custom analytical labels
can also read the cached text of a worksheet reference.

Run the native sample generator and package validator:

```sh
bun scripts/generate-chart-text-fixtures.ts /tmp/chart-text/input
bash scripts/validate-openxml.sh /tmp/chart-text/input/*.docx /tmp/chart-text/input/*.pptx /tmp/chart-text/input/*.xlsx
```

The generator writes 22 samples in all three formats. All 66 files passed Open
XML SDK validation and converted to PDF with LibreOffice during implementation.
The title samples cover all 16 classic chart types.

## Native layout rules

MS-OI29500, Part 1 section 21.2.2.104, requires paired x/y coordinates for text and complete x/y/w/h frames for plot
areas and legends. Invalid or incomplete source layouts retain automatic
geometry. The original source stays editable.

MS-OI29500, Part 1 sections 21.2.2.78 and [21.2.2.229](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/251f0661-860c-455e-bc94-a20c41df76c7), specify that Office ignores
valid width/height values for titles, data labels, trendline labels and display-unit
labels, fitting their text instead. Invalid extents still discard the layout.
The tests exercise both cases. Factor positions offset the automatic box by a
fraction of the full chart, following the [layout-mode notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/bb8565e7-dfea-453f-868b-ae680ab8a823).

Split-pie labels retain full-chart coordinates even when their geometry comes
from either subplot. Moving a label also moves its gradient, picture or pattern
brush bounds. Titles paint above chart data regardless of whether they reserve
automatic space.

## LibreOffice comparison

The controlled title samples use a 480 × 320 pixel chart, edge position 20%/25%,
18-point bold DejaVu Sans and red text. LibreOffice gives the same title position
with or without valid 1% width/height values, confirming text fitting.

After rendering the PPTX at 96 dpi, the bar-chart title's red pixel bounds are
203 pixels wide in both renderers. Tumbler places those pixels at x=99, y=85;
LibreOffice places them at x=103, y=91. Tumbler's text-box inset and baseline
metrics still need work; this is not whole-chart pixel parity. Explicit fonts
are necessary for this comparison because the two renderers substitute missing
Calibri differently.

LibreOffice retains automatic positioning for the factor sample, accepts the
incomplete title frame differently, and does not honor all custom analytical
labels. Those cases follow the documented Microsoft rules in Tumbler rather than
treating LibreOffice output as a complete standards oracle.
