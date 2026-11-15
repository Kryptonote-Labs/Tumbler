import {
  bindChartData,
  createOoxmlChart,
  readChartData,
  type CreateChartOptions,
} from '@tumblerjs/charts';
import type { SpreadsheetArtifact } from './artifact.ts';
import { MAX_CHART_RANGE_CELLS } from './chart-data.ts';
import { formatCellReference, type CellRange } from './references.ts';

export interface ChartRangeOptions {
  readonly firstRowNames?: boolean;
  readonly firstColumnLabels?: boolean;
  readonly switchRowsColumns?: boolean;
}

/** Bind host cells without copying them. Full-column selections project only the used region. */
export function createSpreadsheetRangeChart(
  artifact: SpreadsheetArtifact,
  selection: CellRange,
  options: ChartRangeOptions = {},
  chart: Pick<CreateChartOptions, 'type' | 'conformance'> = {
    type: 'barChart',
    conformance: artifact.workbook.conformance,
  },
): Uint8Array {
  const cells = artifact.worksheet.rows
    .flatMap((row) => row.cells)
    .filter((cell) => cell.value !== undefined || cell.formula !== undefined);
  let { start, end } = selection;
  // A single active cell means its surrounding contiguous data region, not a sample worksheet.
  if (start.row === end.row && start.column === end.column) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const cell of cells) {
        const { row, column } = cell.address;
        if (
          (row >= start.row - 1 &&
            row <= end.row + 1 &&
            column >= start.column &&
            column <= end.column) ||
          (column >= start.column - 1 &&
            column <= end.column + 1 &&
            row >= start.row &&
            row <= end.row)
        ) {
          const nextStart = {
            row: Math.min(start.row, row),
            column: Math.min(start.column, column),
          };
          const nextEnd = { row: Math.max(end.row, row), column: Math.max(end.column, column) };
          changed ||=
            nextStart.row !== start.row ||
            nextStart.column !== start.column ||
            nextEnd.row !== end.row ||
            nextEnd.column !== end.column;
          start = nextStart;
          end = nextEnd;
        }
      }
    }
  }
  const selected = cells.filter(
    (cell) =>
      cell.address.row >= start.row &&
      cell.address.row <= end.row &&
      cell.address.column >= start.column &&
      cell.address.column <= end.column,
  );
  if (!selected.length)
    return createOoxmlChart({
      ...chart,
      categories: [],
      series: Array.from({ length: chart.type === 'stockChart' ? 4 : 1 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: [],
        xValues: [],
        bubbleSizes: [],
      })),
    });
  end = selected.reduce(
    (bound, cell) => ({
      row: Math.max(bound.row, cell.address.row),
      column: Math.max(bound.column, cell.address.column),
    }),
    start,
  );
  const transposed = options.switchRowsColumns ?? start.row === end.row;
  const address = (item: number, series: number) =>
    transposed
      ? { row: start.row + series, column: start.column + item }
      : { row: start.row + item, column: start.column + series };
  const value = (item: number, series: number) =>
    artifact.calculation.value(address(item, series)) ??
    artifact.worksheet.cell(address(item, series))?.value;
  const text = (item: number, series: number) =>
    artifact.calculation.displayText(address(item, series));
  const itemCount = transposed ? end.column - start.column + 1 : end.row - start.row + 1;
  const seriesCount = transposed ? end.row - start.row + 1 : end.column - start.column + 1;
  const header =
    itemCount > 1 &&
    (options.firstRowNames ??
      (Array.from({ length: seriesCount }, (_, index) => value(0, index)).some(
        (cell) => cell?.type === 'string',
      ) &&
        Array.from({ length: seriesCount }, (_, index) => value(1, index)).some(
          (cell) => cell?.type === 'number',
        )));
  const xy = chart.type === 'scatterChart' || chart.type === 'bubbleChart';
  const hasX = xy && seriesCount > 1;
  const labels =
    !xy &&
    seriesCount > 1 &&
    (options.firstColumnLabels ??
      ((chart.type === 'stockChart' && seriesCount === 5) ||
        value(header ? 1 : 0, 0)?.type === 'string'));
  const firstItem = header ? 1 : 0,
    firstSeries = labels || hasX ? 1 : 0;
  const count = itemCount - firstItem;
  const project = count * seriesCount <= MAX_CHART_RANGE_CELLS;
  const stride = chart.type === 'bubbleChart' && hasX ? 2 : 1;
  const columns = Array.from(
    { length: Math.ceil((seriesCount - firstSeries) / stride) },
    (_, index) => firstSeries + index * stride,
  );
  const numeric = (column: number) =>
    project
      ? Array.from({ length: count }, (_, item) => {
          const cell = value(item + firstItem, column);
          return cell?.type === 'number' ? cell.value : null;
        })
      : [];
  const formula = (first: { row: number; column: number }, last = first) => {
    const ref = (point: typeof first) =>
      formatCellReference(point).replace(/([A-Z]+)(\d+)/, '$$$1$$$2');
    return `'${artifact.activeSheet.name.replaceAll("'", "''")}'!${ref(first)}${first.row === last.row && first.column === last.column ? '' : `:${ref(last)}`}`;
  };
  const categories = project
    ? Array.from({ length: count }, (_, item) =>
        labels ? text(item + firstItem, 0) : String(item + 1),
      )
    : [];
  const source = createOoxmlChart({
    ...chart,
    categories,
    series: columns.map((column, index) => ({
      name: header ? text(0, column) || `Series ${index + 1}` : `Series ${index + 1}`,
      values: numeric(column),
      ...(xy
        ? {
            xValues: hasX
              ? numeric(0)
              : Array.from({ length: project ? count : 0 }, (_, item) => item + 1),
          }
        : {}),
      ...(chart.type === 'bubbleChart'
        ? {
            bubbleSizes:
              hasX && column + 1 < seriesCount
                ? numeric(column + 1)
                : Array.from({ length: project ? count : 0 }, () => 1),
          }
        : {}),
    })),
  });
  return bindChartData(
    source,
    readChartData(source).map((plot) => ({
      ...plot,
      series: plot.series.map((series, index) => ({
        ...series,
        ...(header ? { nameFormula: formula(address(0, columns[index]!)) } : {}),
        ...(hasX
          ? {
              xValues: {
                ...series.xValues!,
                formula: formula(address(firstItem, 0), address(itemCount - 1, 0)),
              },
            }
          : {}),
        ...(chart.type === 'bubbleChart' && hasX && columns[index]! + 1 < seriesCount
          ? {
              bubbleSizes: {
                ...series.bubbleSizes!,
                formula: formula(
                  address(firstItem, columns[index]! + 1),
                  address(itemCount - 1, columns[index]! + 1),
                ),
              },
            }
          : {}),
        ...(labels
          ? {
              categories: {
                ...series.categories!,
                formula: formula(address(firstItem, 0), address(itemCount - 1, 0)),
              },
            }
          : {}),
        values: {
          ...series.values!,
          formula: formula(
            address(firstItem, columns[index]!),
            address(itemCount - 1, columns[index]!),
          ),
        },
      })),
    })),
  );
}
