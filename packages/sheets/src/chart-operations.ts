import { chartBase64ToBytes, chartBytesToBase64, convertChartType, editChartSource, editChartSeries, bindChartData, parseChartResources, setChartPictureFill, type ChartResources, type ChartContent, type ChartSourceEdit, type ChartTypeChange, type ChartSeriesEdit, type ChartEditablePlot } from '@tumblerjs/charts';
import { createChartWorkbook, extendChartWorkbook, refreshChartWorkbook } from './chart-workbook.ts';
import { openSpreadsheetArtifact } from './artifact.ts';
import { beginSpreadsheetEdit } from './editor.ts';

export type ChartContentEdit = { readonly picture: { readonly node: number; readonly data: string; readonly contentType: string } } | { readonly resources: ChartResources; readonly edits?: readonly ChartSourceEdit[] | undefined } | { readonly edits: readonly ChartSourceEdit[] } | (ChartTypeChange & { readonly plot?: number | undefined }) | { readonly series: ChartSeriesEdit } | { readonly data: readonly ChartEditablePlot[] } | {
  readonly cells: readonly { readonly sheet?: string | undefined; readonly reference: string; readonly value?: string | number | boolean | null | undefined; readonly formula?: string | undefined }[];
};

/** The same source/type/data operations serve property panes, hosted agents and the file CLI. */
export function applyChartContentEdit(content: ChartContent, input: ChartContentEdit): ChartContent {
  let source: Uint8Array = new TextEncoder().encode(content.xml);
  if ('picture' in input) return setChartPictureFill(content, input.picture.node, input.picture);
  if ('resources' in input) return { ...content, resources: parseChartResources(input.resources), xml: input.edits ? new TextDecoder().decode(editChartSource(source, input.edits)) : content.xml };
  if ('edits' in input) return { ...content, xml: new TextDecoder().decode(editChartSource(source, input.edits)) };
  if ('type' in input || 'series' in input || 'data' in input) {
    const changed = 'type' in input ? convertChartType(source, input, input.plot ?? 0) : 'series' in input ? editChartSeries(source, input.series) : bindChartData(source, input.data);
    if (content.workbook === undefined) return { ...content, xml: new TextDecoder().decode(changed) };
    const workbook = extendChartWorkbook(changed, openSpreadsheetArtifact(chartBase64ToBytes(content.workbook)));
    return { ...content, xml: new TextDecoder().decode(refreshChartWorkbook(workbook.source, workbook.artifact)), workbook: chartBytesToBase64(workbook.artifact.bytes()) };
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
  return { ...content, xml: new TextDecoder().decode(refreshChartWorkbook(source, updated)), workbook: chartBytesToBase64(workbook) };
}
