# Numeric-axis text rotation

The 2-D Cartesian and XY renderers now apply the numeric axis's DrawingML text rotation. They rotate the fitted text box, retain its axis-side edge and centre it on the same tick. Both XY axes use their own source rotation. The automatic Cartesian frame reserves rotated width and vertical end clearance; its tick scale is recalculated when that changes the plot height. Explicit manual plot frames remain authored.

`scripts/generate-chart-axis-rotation-fixtures.ts` produces four cases at 0, 45, -45 and 90 degrees in DOCX, PPTX and XLSX. All twelve packages pass Open XML SDK validation, and LibreOffice 26.8 converts all four presentations to PDF. The references use DejaVu Sans 10pt and a fixed inner plot to isolate rotation from automatic margins. They establish native acceptance and visible rotation, not coordinate-level pixel parity. Rotated horizontal-bar labels reserve endpoint and top/bottom clearance as well. Three-dimensional numeric axes and automatic XY edge clearance remain separate compatibility work.

Four focused tests cover parsed rotations, retained axis-side/tick alignment, automatic label bounds and both XY value axes. All 590 chart tests pass with 4760 assertions, and the chart sources, focused test and fixture generator pass TypeScript checking. Source properties remain fully accessible through the existing shared editor and CLI.
