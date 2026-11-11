import { resolve } from 'node:path';
import { chartBytesToBase64 } from '../packages/charts/src/index.ts';
import { createChartWorkbook, applySpreadsheetCommand } from '../packages/sheets/src/index.ts';
import { createWordArtifact } from '../packages/word/src/index.ts';
import { createPresentation, applyPresentationCommand } from '../packages/slides/src/index.ts';

/** Exercise the same chart source through all three native package/relationship graphs. */
export async function writeChartFixture(output: string, name: string, source: Uint8Array): Promise<void> {
  const created = createChartWorkbook(source);
  const content = { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) };
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 480, height: 320, content } }] }] });
  const slides = createPresentation();
  const presentation = applyPresentationCommand(slides, { name: 'insert-chart', slideId: slides.document.slides[0]!.id, bounds: { x: 80, y: 80, width: 480, height: 320 }, content });
  const spreadsheet = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: String(created.artifact.activeSheet.sheetId), x: 160, y: 100, width: 480, height: 320, content: { xml: content.xml } });
  await Promise.all([Bun.write(resolve(output, `${name}.docx`), word.bytes()), Bun.write(resolve(output, `${name}.pptx`), presentation.bytes()), Bun.write(resolve(output, `${name}.xlsx`), spreadsheet.bytes())]);
}
