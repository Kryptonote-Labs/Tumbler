# Chart plot layout reference checks

Plot `manualLayout` now affects the shared scene used by SVG and canvas. The model
retains fractions and modes instead of rewriting the chart source. TypeScript
tests cover all 16 classic plot elements, including split-pie subplots, secondary
axes, reversed categories, High/Low label positions and zero extents.

Run the sample generator and package validator:

```sh
bun scripts/generate-chart-layout-fixtures.ts /tmp/chart-layout/input
bash scripts/validate-openxml.sh /tmp/chart-layout/input/*.docx /tmp/chart-layout/input/*.pptx /tmp/chart-layout/input/*.xlsx
```

The generator writes seven layout cases and a sample of each classic chart type
in all three formats. All 69 files passed Open XML SDK validation and converted
to PDF with LibreOffice during implementation.

## Position semantics

The implementation follows Microsoft's [layout mode notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/bb8565e7-dfea-453f-868b-ae680ab8a823):
factor coordinates offset the automatic position by a fraction of the full chart
dimension. Edge coordinates start at the chart origin. Factor extents specify
width or height; edge extents specify the far edge.

Microsoft's [position notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/d8c75860-15ff-4ba8-9f75-a6da4b68014d)
discard invalid positions and move valid boxes inward when needed to retain their
size. These rules affect rendering, while the original source remains editable.

## Measured plot boundaries

These samples use a 480 × 320 pixel chart. A green plot background makes the
painted data frame measurable independently of text rasterization. Coordinates
below describe the green pixel bounds after rendering the PPTX reference at
96 dpi.

| Case | Tumbler x, y, width, height | LibreOffice x, y, width, height |
| --- | --- | --- |
| Inner, edge coordinates | 97, 81, 239, 158 | 97, 81, 239, 159 |
| Inner, edge extents | 97, 81, 239, 158 | 97, 81, 239, 159 |
| Outer, edge coordinates | 114, 81, 222, 133 | 114, 81, 222, 134 |

The measured difference is one pixel at the bottom edge. These checks establish
the tested plot boundaries, not whole-chart pixel parity. Automatic layout, fonts, axes and series geometry need their own checks.

LibreOffice retained automatic geometry for the factor-positioned sample and
clamped the lower-edge sample differently. Tumbler follows the documented
Microsoft coordinate rules for those cases. Keep these differences visible when
using LibreOffice as an interoperability reference.
