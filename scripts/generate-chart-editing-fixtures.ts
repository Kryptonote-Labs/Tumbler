import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OOXML_CHART_TYPES, chartBytesToBase64, createOoxmlChart, convertChartType, editChartSeries } from '../packages/charts/src/index.ts';
import { createChartWorkbook, applySpreadsheetCommand, applyChartContentEdit } from '../packages/sheets/src/index.ts';
import { createWordArtifact } from '../packages/word/src/index.ts';
import { createPresentation, applyPresentationCommand } from '../packages/slides/src/index.ts';

/** Native drawings and real workbook relationships for schema and LibreOffice interoperability checks. */
const output = resolve(process.argv[2] ?? 'compatibility-results/chart-editing/input');
await mkdir(output, { recursive: true });
for (const type of OOXML_CHART_TYPES) {
  const created = createChartWorkbook(createOoxmlChart({ type, title: type, categories: ['January', 'February', 'March', 'April'], series: [
    { name: type === 'stockChart' ? 'High' : 'Revenue', values: [12, 18, 15, 22], xValues: [1, 2, 3, 4], bubbleSizes: [8, 12, 6, 16] },
    { name: type === 'stockChart' ? 'Low' : 'Costs', values: [6, 10, 8, 12], xValues: [1, 2, 3, 4], bubbleSizes: [4, 8, 3, 9] },
    { name: type === 'stockChart' ? 'Close' : 'Profit', values: [9, 14, 12, 18], xValues: [1, 2, 3, 4], bubbleSizes: [3, 7, 5, 10] },
  ] }));
  let content = { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) };
  // Exercise caches, formulas and conversion history before each host serializes the result.
  content = applyChartContentEdit(content, { cells: [{ reference: 'B2', formula: '3*4' }] });
  const original = new TextEncoder().encode(content.xml);
  const other = convertChartType(original, { type: type === 'barChart' ? 'lineChart' : 'barChart' });
  const restored = convertChartType(other, { type });
  content = { ...content, xml: new TextDecoder().decode(restored) };
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 480, height: 320, content } }] }] });
  const slides = createPresentation();
  const presentation = applyPresentationCommand(slides, { name: 'insert-chart', slideId: slides.document.slides[0]!.id, bounds: { x: 80, y: 80, width: 480, height: 320 }, content });
  const spreadsheet = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: String(created.artifact.activeSheet.sheetId), x: 160, y: 100, width: 480, height: 320, content: { xml: content.xml } });
  await Promise.all([Bun.write(resolve(output, `${type}.docx`), word.bytes()), Bun.write(resolve(output, `${type}.pptx`), presentation.bytes()), Bun.write(resolve(output, `${type}.xlsx`), spreadsheet.bytes())]);
}
// Membership changes also get independent schema validation, including a fully empty chart.
let source = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'One', values: [2] }, { name: 'Two', values: [3] }] });
source = editChartSeries(source, { action: 'duplicate', series: 0 });
source = editChartSeries(source, { action: 'move', series: 2, to: 0 });
source = editChartSeries(source, { action: 'remove', series: 1 });
for (const [name, bytes] of [['series-edits', source], ['empty', createOoxmlChart({ type: 'pieChart', categories: [], series: [] })]] as const) {
  await Bun.write(resolve(output, `${name}.docx`), createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 480, height: 320, content: { xml: new TextDecoder().decode(bytes) } } }] }] }).bytes());
}
console.log(output);
