import { bindChartData, readChartData, updateChartData, type ChartEditablePlot, type ChartEditableSequence } from '@tumblerjs/charts';
import { createSpreadsheet, applySpreadsheetCommand } from './commands.ts';
import { SpreadsheetArtifact, openSpreadsheetArtifact } from './artifact.ts';
import { beginSpreadsheetEdit } from './editor.ts';
import { EXCEL_MAX_COLUMNS, formatCellReference } from './references.ts';
import { parseSpreadsheetChartReference } from './chart-data.ts';
import { calculateSpreadsheetWorksheet } from './calculation.ts';
import { openWorksheet } from './worksheet.ts';

export interface ChartWorkbookEdit {
  readonly source: Uint8Array;
  readonly artifact: SpreadsheetArtifact;
}

/** Give a literal-data chart a real workbook, including XY coordinates and bubble sizes. */
function bindWorkbook(source: Uint8Array, input: SpreadsheetArtifact, onlyUnbound: boolean): ChartWorkbookEdit {
  const data = readChartData(source);
  const reference = onlyUnbound ? data.flatMap(plot => plot.series.flatMap(series => [series.categories, series.values, series.xValues, series.bubbleSizes])).flatMap(sequence => sequence?.formula ? [parseSpreadsheetChartReference(sequence.formula, input.activeSheet.name)] : []).find(reference => reference && input.workbook.sheet(reference.sheet)) : undefined;
  let artifact = reference ? input.selectSheet(reference.sheet) : input;
  let column = 1;
  if (onlyUnbound) for (const row of artifact.worksheet.rows) for (const cell of row.cells) column = Math.max(column, cell.address.column + 1);
  const required = data.flatMap(plot => plot.series.flatMap(series => [series.categories, series.xValues, series.values, series.bubbleSizes, ...(series.errorBars?.flatMap(errors => [errors.plus, errors.minus]) ?? [])])).reduce((count, sequence) => count + (sequence && (!onlyUnbound || !sequence.formula) ? sequence.levels?.length ?? 1 : 0), 0);
  if (column + required > EXCEL_MAX_COLUMNS + 1) {
    let name = 'Chart data';
    for (let suffix = 2; artifact.workbook.sheets.some(sheet => sheet.name === name); suffix++) name = `Chart data ${suffix}`;
    artifact = applySpreadsheetCommand(artifact, { name: 'add-sheet', nameValue: name });
    artifact = artifact.selectSheet(name);
    column = 1;
  }
  const edit = beginSpreadsheetEdit(artifact.workbook);
  const sheet = artifact.activeSheet;
  const sheetName = `'${sheet.name.replaceAll("'", "''")}'`;
  function sequence(data: ChartEditableSequence | undefined, label: string): ChartEditableSequence | undefined {
    if (!data) return;
    if (onlyUnbound && data.formula !== undefined) return data;
    const firstColumn = column;
    const levels = data.levels ? [...data.levels].reverse() : [data.values];
    for (const values of levels) {
      edit.setCellValue(sheet, { row: 1, column }, label);
      values.forEach((value, index) => { if (value !== null) edit.setCellValue(sheet, { row: index + 2, column }, value); });
      column++;
    }
    const start = formatCellReference({ row: 2, column: firstColumn }).replace(/([A-Z]+)(\d+)/, '$$$1$$$2');
    const end = formatCellReference({ row: Math.max(2, data.values.length + 1), column: column - 1 }).replace(/([A-Z]+)(\d+)/, '$$$1$$$2');
    return { ...data, formula: `${sheetName}!${start}:${end}` };
  }
  const categoryBindings = new Map<string, ChartEditableSequence>();
  const plots = data.map(plot => ({ ...plot, series: plot.series.map(series => {
    const categoryKey = series.categories && JSON.stringify({ kind: series.categories.kind, values: series.categories.values, levels: series.categories.levels });
    const categories = onlyUnbound && series.categories?.formula !== undefined ? series.categories : categoryKey && categoryBindings.has(categoryKey) ? categoryBindings.get(categoryKey) : sequence(series.categories, 'Category');
    if (categoryKey && categories) categoryBindings.set(categoryKey, categories);
    const xValues = sequence(series.xValues, 'X');
    const valueColumn = column;
    const values = sequence(series.values, series.name);
    const bubbleSizes = sequence(series.bubbleSizes, 'Size');
    const errorBars = series.errorBars?.map(errors => ({ plus: sequence(errors.plus, 'Positive error'), minus: sequence(errors.minus, 'Negative error') }));
    let nameFormula = series.nameFormula;
    if (values && (!onlyUnbound || series.values?.formula === undefined)) nameFormula = `${sheetName}!${formatCellReference({ row: 1, column: valueColumn }).replace(/([A-Z]+)(\d+)/, '$$$1$$$2')}`;
    else if (values && nameFormula === undefined) {
      edit.setCellValue(sheet, { row: 1, column }, series.name);
      nameFormula = `${sheetName}!${formatCellReference({ row: 1, column }).replace(/([A-Z]+)(\d+)/, '$$$1$$$2')}`;
      column++;
    }
    return { ...series, ...(errorBars ? { errorBars } : {}), categories, xValues, values, bubbleSizes, ...(nameFormula === undefined ? {} : { nameFormula }) };
  }) }));
  const pkg = edit.commitPackage();
  return { source: bindChartData(source, plots), artifact: openSpreadsheetArtifact(pkg.archive.originalBytes(), { sheet: sheet.name }) };
}

/** Refresh source caches from calculated workbook cells, leaving unresolvable references intact. */
export function refreshChartWorkbook(source: Uint8Array, artifact: SpreadsheetArtifact): Uint8Array {
  const calculations = new Map<string, ReturnType<typeof calculateSpreadsheetWorksheet>>();
  const calculationFor = (name: string) => {
    let calculation = calculations.get(name);
    if (!calculation) {
      const sheet = artifact.workbook.sheet(name);
      if (!sheet) return undefined;
      calculation = sheet === artifact.activeSheet ? artifact.calculation : calculateSpreadsheetWorksheet(openWorksheet(artifact.workbook, sheet));
      calculations.set(name, calculation);
    }
    return calculation;
  };
  function sequence(data: ChartEditableSequence | undefined): ChartEditableSequence | undefined {
    if (!data?.formula) return data;
    const reference = parseSpreadsheetChartReference(data.formula, artifact.activeSheet.name);
    const calculation = reference && calculationFor(reference.sheet);
    if (!reference || !calculation) return data;
    const { start, end } = reference.range;
    const point = (row: number, column: number) => {
      const value = calculation.value({ row, column }) ?? calculation.worksheet.cell({ row, column })?.value;
      if (data.kind === 'string') return calculation.displayText({ row, column });
      return value?.type === 'number' ? value.value : value?.type === 'boolean' ? value.value ? 1 : 0 : null;
    };
    if (data.levels) {
      const levels = Array.from({ length: end.column - start.column + 1 }, (_, level) => Array.from({ length: end.row - start.row + 1 }, (_, index) => point(start.row + index, end.column - level)));
      return { ...data, values: levels[0] ?? [], levels };
    }
    const values: (string | number | null)[] = [];
    for (let row = start.row; row <= end.row; row++) for (let column = start.column; column <= end.column; column++) values.push(point(row, column));
    return { ...data, values };
  }
  const plots: ChartEditablePlot[] = readChartData(source).map(plot => ({ ...plot, series: plot.series.map(series => {
    const title = series.nameFormula && parseSpreadsheetChartReference(series.nameFormula, artifact.activeSheet.name);
    const name = title && calculationFor(title.sheet)?.displayText(title.range.start);
    return { ...series, ...(typeof name === 'string' ? { name } : {}), categories: sequence(series.categories), xValues: sequence(series.xValues), values: sequence(series.values), bubbleSizes: sequence(series.bubbleSizes), ...(series.errorBars ? { errorBars: series.errorBars.map(errors => ({ plus: sequence(errors.plus), minus: sequence(errors.minus) })) } : {}) };
  }) }));
  return updateChartData(source, plots);
}

/** Materialize literal data into a new editable chart workbook. */
export function createChartWorkbook(source: Uint8Array): ChartWorkbookEdit { return bindWorkbook(source, createSpreadsheet(), false); }

/** Add newly introduced type data, such as XY coordinates or sizes, without changing existing cells or formulas. */
export function extendChartWorkbook(source: Uint8Array, artifact: SpreadsheetArtifact): ChartWorkbookEdit { return bindWorkbook(source, artifact, true); }
