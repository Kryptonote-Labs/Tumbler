# 3-D pie projection

The pie renderer projects a cylinder through one camera for the top faces, visible curved sides, exploded slices, labels and manual leader anchors. Perspective now affects the preview. Rotation continues to come from the shared slice layout, so it is applied once.

The camera fits the cylinder's box to the authored plot frame. Pie thickness is one tenth of the diameter. Cartesian height/depth percentages and right-angle axes remain editable in the source property tree and are preserved, but no longer change the pie rendering. The 3-D pane offers perspective and removes the misleading thickness control.

## Native evidence

`scripts/generate-chart-pie-projection-fixtures.ts` creates seven controlled cases in DOCX, PPTX and XLSX: four rotations, height percentages 100 and 200, and zero perspective. All 21 packages pass Open XML SDK 3.5.1 validation. LibreOffice 26.8.2.2 converts all seven presentations to PDF. Explicit label flags, DejaVu Sans 10 pt, no legend and an inner plot at 10%,10%,80%,80% isolate the camera.

The four rotated references place all twelve label centers within 0.3 CSS pixels horizontally and 2 CSS pixels vertically of the renderer at 480 × 320. These tolerances compare native text bounds with measured renderer boxes. They do not establish pixel parity for text, shading, exploded cut faces or picture mapping. Native height 100 and 200 are identical; zero perspective produces a wider pie.

The camera's reciprocal distance interpolates between 20 diameters at perspective zero and 0.75 diameters at 200, with zero using parallel projection. These endpoints match [LibreOffice's camera distance mapping](https://github.com/LibreOffice/core/blob/master/chart2/source/tools/ThreeDHelper.cxx). The cylinder aspect follows [its pie geometry](https://github.com/LibreOffice/core/blob/master/chart2/source/view/charttypes/PieChart.cxx). The independent projection code uses standard rotation and perspective equations. [LibreOffice's OOXML converter](https://github.com/LibreOffice/core/blob/master/oox/source/drawingml/chart/plotareaconverter.cxx) treats pie rotation as the first-slice angle and ignores right-angle axes. Values above 200 remain authored and round-trip; this renderer follows the reference application's camera clamp.

## Validation

61 focused tests with 1659 assertions cover the native label centers, camera changes, inverse projection for label hit tests, zero and ninety degree elevation, rotation, fitted explosion at the strongest perspective, manual leaders, 2-D conversion and existing pie/3-D rendering. A focused TypeScript check passes. Local commands run serially at 600 MiB, without swap, and 40% of one CPU. Broad checks run in CI.
