# Pie label placement and leader lines

Pie labels now position their fitted box at the slice center, inside end or outside end. Doughnut centers follow the middle of each ring. Best fit keeps the label inside when its box fits the slice, otherwise it uses the outside end. Exploded slices and the 3-D projection supply their own center and radii.

Manual label coordinates still use the full chart frame. Enabled leader lines connect manually displaced outside labels to their slice and retain native stroke colour, width, dash and no-fill. Rotated frames use their oriented outline. Both plots of split charts paint before their leaders, and all leaders paint before label backgrounds and text.

## Native evidence

`scripts/generate-chart-pie-label-fixtures.ts` creates eight pie/pie3D cases in DOCX, PPTX and XLSX. All 24 packages pass Open XML SDK 3.5.1 validation. LibreOffice 26.8.2.2 converted the manual leader and 3-D center/outside cases. Earlier conversions of the same 2-D center/inside/outside sources supply the placement measurements below.

At the 1440 × 810 reference size, the chart origin is 90,90 and one chart CSS pixel occupies 1.125 reference pixels. The tests use the reference font widths and allow less than one reference pixel in each measured coordinate.

| Placement | North | East | West |
| --- | --- | --- | --- |
| Center, box midpoint | 428.5,291.5 | 288,269.5 | 337.5,201.5 |
| Inside end, top left | 450,295 | 222,261 | 317,139 |
| Outside end, top left | 503,316 | 178,261 | 277,110 |

These measurements establish the tested 2-D placements. They do not establish whole-chart pixel parity. LibreOffice repositions the manually moved label in its import. The renderer retains authored manual coordinates. The subsequent [3-D projection work](chart-pie-projection-reference.md) compares the camera with additional controlled native references; text metrics and whole-chart pixel parity remain separate work.

## Standards

ECMA-376 Part 1 §21.2.2.48 defines `dLblPos`; §21.2.2.92 and §21.2.2.183 define leader lines and their enable flag. [Microsoft's position notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/e2b1697c-7adc-463d-9081-3daef72f656f) specify best fit for pie groups and center for doughnut groups. MS-OI29500 §2.1.1487 and §2.1.1549 describe the pie-family ancestors and sibling flags Office expects for leader lines. These notes guide rendering and do not add authoring restrictions.

## Focused validation

`bun test packages/charts/test/pie-label-position.test.ts packages/charts/test/data-labels.test.ts packages/charts/test/split-pie-layout.test.ts` passes 25 tests with 307 assertions. It covers the measured 2-D positions, both namespace families, best fit, rings and explosion, manual coordinates, enable flags, stroke inheritance, rotated frame attachment, paint order and existing non-pie label behavior. The chart source and the new test also pass a focused TypeScript check.

Local checks use a 600 MiB memory limit, no swap and 40% of one CPU. Broad checks run in CI.
