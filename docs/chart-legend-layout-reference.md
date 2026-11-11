# Manual legend layout reference checks

Legend `manualLayout` now sets the native legend rectangle in the shared SVG and
canvas scene. Entries reflow into rows and columns inside that rectangle, with
the original order, individual formatting and deleted entries preserved. Small
frames clip their contents; fonts and document source remain editable.

The chart retains its automatic legend reservation unless `overlay` changes.
LibreOffice confirmed this for both bottom and right legends moved over the plot.

Generate the native samples:

```sh
bun scripts/generate-chart-legend-layout-fixtures.ts /tmp/chart-legend-layout/input
bash scripts/validate-openxml.sh /tmp/chart-legend-layout/input/*.docx /tmp/chart-legend-layout/input/*.pptx /tmp/chart-legend-layout/input/*.xlsx
```

The generator covers six manual frames and all 16 classic chart types in Word,
PowerPoint and Excel packages. All 66 files passed Open XML SDK validation and
converted to PDF with LibreOffice during implementation. Invalid or incomplete native frames retain
automatic layout. Factor coordinates offset the automatic frame, edge coordinates
start at the chart origin, and edge extents name the far edge, following the
[Microsoft layout-mode notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/bb8565e7-dfea-453f-868b-ae680ab8a823).

## Measured frame boundaries

A green legend background makes its frame measurable independently of fonts.
The reference chart is 480 × 320 pixels. The PPTX was rendered at 96 dpi.

| Case | Tumbler x, y, width, height | LibreOffice x, y, width, height |
| --- | --- | --- |
| Bottom | 96, 80, 240, 160 | 96, 80, 240, 160 |
| Right | 96, 80, 240, 160 | 96, 80, 240, 160 |
| Bottom, overlay | 96, 80, 240, 160 | 96, 80, 240, 160 |
| Edge extents | 96, 80, 240, 160 | 96, 80, 240, 160 |
| Narrow | 288, 64, 120, 208 | 288, 64, 120, 208 |
| Wide | 48, 192, 384, 64 | 48, 192, 384, 64 |

These are exact painted frame matches for the six samples. Text rasterization,
entry spacing and the chart's automatic axes and series geometry still have
separate differences; the frame check is not whole-chart pixel parity.
