import { chartBase64ToBytes, chartBytesToBase64, convertChartType, editChartSource, type ChartContent, type ChartSourceEdit, type ChartTypeChange } from '@tumblerjs/charts';
import { createChartWorkbook, extendChartWorkbook, refreshChartWorkbook } from './chart-workbook.ts';
import { openSpreadsheetArtifact } from './artifact.ts';
import { beginSpreadsheetEdit } from './editor.ts';

export type ChartContentEdit = { readonly edits: readonly ChartSourceEdit[] } | ChartTypeChange | {
  readonly cells: readonly { readonly sheet?: string | undefined; readonly reference: string; readonly value?: string | number | boolean | null | undefined; readonly formula?: string | undefined }[];
};

/** The same source/type/data operations serve property panes, hosted agents and the file CLI. */
export function applyChartContentEdit(content: ChartContent, input: ChartContentEdit): ChartContent {
  let source: Uint8Array = new TextEncoder().encode(content.xml);
  if ('edits' in input) return { ...content, xml: new TextDecoder().decode(editChartSource(source, input.edits)) };
  if ('type' in input) {
    const changed = convertChartType(source, input);
    if (content.workbook === undefined) return { ...content, xml: new TextDecoder().decode(changed) };
    const workbook = extendChartWorkbook(changed, openSpreadsheetArtifact(chartBase64ToBytes(content.workbook)));
    return { xml: new TextDecoder().decode(workbook.source), workbook: chartBytesToBase64(workbook.artifact.bytes()) };
  }
  let artifact;
  if (content.workbook === undefined) {
    const created = createChartWorkbook(source);
    source = created.source;
    artifact = created.artifact;
  } else artifact = openSpreadsheetArtifact(chartBase64ToBytes(content.workbook));
  const edit = beginSpreadsheetEdit(artifact.workbook);
  for (const cell of input.cells) {
    const sheet = cell.sheet === undefined ? artifact.activeSheet : artifact.workbook.sheet(cell.sheet);
    if (!sheet) throw new RangeError('Source worksheet is missing.');
    if (cell.formula !== undefined) edit.setCellFormula(sheet, cell.reference, cell.formula.replace(/^=/, ''));
    else if (cell.value !== undefined) edit.setCellValue(sheet, cell.reference, cell.value);
    else throw new TypeError('Supply a value or formula for each cell.');
  }
  const workbook = edit.commit();
  const updated = openSpreadsheetArtifact(workbook);
  return { xml: new TextDecoder().decode(refreshChartWorkbook(source, updated)), workbook: chartBytesToBase64(workbook) };
}
