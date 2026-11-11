# Consecutive chart type changes

The recorded gallery sequence exposed three conversion bugs that isolated type conversions missed:

- Inactive depth/category/value axes accumulated in the native plot and eventually failed Open XML SDK validation.
- String category labels became numeric XY coordinates when switching from an XY plot into a previously unvisited category plot.
- A clustered chart could restore a stacked chart's 100% overlap from type history.

Inactive axis XML now lives in the existing type-history extension. Active plots retain their axes and the transitive crossing dependencies of peer axes. Compatible axes keep their formatting, category/date axes remain compatible, and new unsigned IDs do not overflow the highest authored ID. New axes precede plot decorations in schema order.

Category labels and XY coordinates retain their separate source data. The most recent category snapshot is selected by plot and series identity, including when the destination type has an older snapshot. Changing grouping resets incompatible overlap, while selecting the same grouping and compatible round trips retain authored overlap.

## Evidence

`bun scripts/generate-chart-conversion-fixtures.ts /tmp/chart-conversions/input` changes one chart consecutively through all 44 gallery variants. Each step checks values, category labels and clustered overlap, then creates DOCX, PPTX and XLSX packages. All 132 packages pass Open XML SDK 3.5.1 validation. The corrected recorded editor also exports three passing native packages with the embedded `8*7` formula retained.

The focused conversion suite passes 34 tests and 115 assertions. It covers both namespace families, axis formatting restoration, plot-child order, shared axes and crossing dependencies, the largest unsigned axis ID, category edits, independent XY edits and grouping changes. Focused TypeScript validation passes. Independent static review has no remaining findings.

Local checks run serially with 600MiB RAM, no swap and 40% of oneCPU. This evidence concerns data retention and native package validity; it does not establish pixel parity for every rendering property.
