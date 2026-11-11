import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chartBytesToBase64, createOoxmlChart } from '../packages/charts/src/index.ts';
import { createChartWorkbook, applySpreadsheetCommand } from '../packages/sheets/src/index.ts';
import { createWordArtifact } from '../packages/word/src/index.ts';
import { createPresentation, applyPresentationCommand } from '../packages/slides/src/index.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-stock/input');
await mkdir(output, { recursive: true });
for (const open of [false, true]) {
  const bytes = createOoxmlChart({ type: 'stockChart', title: open ? 'Open-high-low-close' : 'High-low-close', categories: ['Mon', 'Tue', 'Wed', 'Thu'], series: [
    ...(open ? [{ name: 'Open', values: [4, 8, 5, 9] }] : []), { name: 'High', values: [9, 10, 8, 12] }, { name: 'Low', values: [2, 3, 3, 4] }, { name: 'Close', values: [7, 5, 7, 6] },
  ] });
  const created = createChartWorkbook(bytes);
  const content = { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) };
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 480, height: 320, content } }] }] });
  const slides = createPresentation();
  const presentation = applyPresentationCommand(slides, { name: 'insert-chart', slideId: slides.document.slides[0]!.id, bounds: { x: 80, y: 80, width: 480, height: 320 }, content });
  const spreadsheet = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: String(created.artifact.activeSheet.sheetId), x: 160, y: 100, width: 480, height: 320, content: { xml: content.xml } });
  const stem = open ? 'open-high-low-close' : 'high-low-close';
  await Promise.all([Bun.write(resolve(output, `${stem}.docx`), word.bytes()), Bun.write(resolve(output, `${stem}.pptx`), presentation.bytes()), Bun.write(resolve(output, `${stem}.xlsx`), spreadsheet.bytes())]);
}
console.log(output);
