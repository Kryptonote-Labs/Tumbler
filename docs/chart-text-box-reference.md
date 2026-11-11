# Rotated chart text-box paint

Chart titles, point labels, trendline labels and display-unit labels now rotate
their backgrounds with their text. Solid, gradient, picture and pattern fills,
and their outlines, retain local brush coordinates inside a rotated scene group.
Manual movement translates the group origin and its contents together.

`ChartMark` groups accept an optional clockwise rotation about a chart-local
point. Canvas and SVG apply it before the group's local clip. Procedural gradient
coverage uses the inverse rotation of the viewport, keeping brush allocation
bounded without cropping visible paint.

Run the native sample generator and package validator:

```sh
bun scripts/generate-chart-text-box-fixtures.ts /tmp/chart-text-box/input
bash scripts/validate-openxml.sh /tmp/chart-text-box/input/*.docx /tmp/chart-text-box/input/*.pptx /tmp/chart-text-box/input/*.xlsx
```

The 24 cases cover four fill kinds across the four text-box owners, including
0°, 45° and 90° chart titles. All 72 Word, PowerPoint and Excel packages passed
Open XML SDK validation and converted to PDF in LibreOffice during implementation.

Real canvas tests check diagonal title paint, gradient and picture orientation,
local clipping and context restoration. A mounted SVG test changes rotation,
replaces a gradient with a picture, removes the rotation, and restores it.

## Measured reference differences

The reference uses a 480 × 320 chart and an 18-point bold DejaVu Sans title,
"Quarterly", with a green background and a one-point outline. The PPTX reference
was rasterized at 96 dpi. The green mask's principal direction differs by less
than 0.06° between Tumbler and LibreOffice in the three angle samples.

| Rotation | Tumbler green bounds x, y, width, height | LibreOffice green bounds |
| --- | --- | --- |
| 0° | 97, 81, 135, 33 | 97, 81, 135, 41 |
| 45° | 98, 82, 118, 118 | 68, 82, 123, 123 |
| 90° | 97, 81, 33, 135 | 97, 81, 41, 135 |

The backgrounds now have the correct rotated form. Text-box inset and line
metrics still differ. LibreOffice also anchors the manually positioned 45° box
differently. Those placement and sizing differences remain visible here; this
check does not establish text-box pixel parity.
