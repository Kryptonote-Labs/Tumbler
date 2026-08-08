# Spreadsheet chart milestone

This milestone adds a native, read-only chart preview to ordinary SpreadsheetML
worksheets. Tumbler continues to preserve the original OOXML parts byte-for-byte
unless an explicitly supported worksheet value is edited. Chart creation and
chart XML editing are outside this milestone.

## Standards boundary

The implementation follows ECMA-376 Part 1:

- §12.3.8 and §18.3.1.36 for worksheet Drawing parts;
- §20.5.2.1, §20.5.2.24, and §20.5.2.33 for absolute, one-cell, and two-cell
  spreadsheet drawing anchors;
- §14.2.1 and §21.2.2.27–29 for Chart parts and `chartSpace`;
- §21.2.2.65, §21.2.2.120, §21.2.2.123, §21.2.2.199, and §21.2.2.201 for
  formula references and cached numeric/string data;
- §21.2.2.16, §21.2.2.97, §21.2.2.141, and §21.2.2.161 for bar/column,
  line, pie-family, and scatter charts;
- §21.2.2.162, §21.2.3.27, and §21.2.3.40 for scatter and marker style
  semantics.

Both Strict and Transitional namespace and relationship profiles are required.
Relationship targets are resolved through OPC; external relationships are never
dereferenced by the chart reader.

## Included

- worksheet Drawing and Chart part discovery;
- absolute, one-cell, and two-cell anchors in sheet coordinates;
- clustered column/bar, line, pie, doughnut, and XY scatter charts;
- marker-only, straight-line, straight-line-with-markers, smooth-line, and
  smooth-line-with-markers scatter styles, including common marker shapes;
- paired sparse numeric X/Y caches and independently scaled numeric axes;
- titles, legends, category/value axes, major gridlines, and multiple series;
- cached string and numeric series data;
- simple internal A1 source ranges, refreshed from workbook cells when resolvable;
- numeric category labels formatted through the chart cache format code or their
  source cell format, including workbook date-system semantics;
- numeric scatter axis labels formatted through axis/cache format codes,
  including date-formatted serial X coordinates;
- theme palette colors and explicit solid fills/lines;
- owned Svelte SVG rendering, selection, and an accessible bounded fallback;
- scrolling and frozen-pane integration.

## Deliberately deferred

- chart creation or mutation of chart XML and caches;
- chartsheets, PivotCharts, ChartEx, and embedded/external workbooks;
- 3-D, combination, area, bubble, stock, radar, and surface charts;
- secondary axes, trendlines, error bars, and full data-label fidelity;
- structured, defined-name, dynamic, or external-workbook source references;
- exact Office text measurement and every theme/style effect.

Unsupported or malformed charts remain preserved. When their anchor is safe to
interpret, the renderer shows a bounded fallback instead of guessing at chart
semantics or hiding the rest of the worksheet.
