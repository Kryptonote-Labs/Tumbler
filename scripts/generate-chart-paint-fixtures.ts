import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chartBytesToBase64, createOoxmlChart } from '../packages/charts/src/index.ts';
import { createChartWorkbook, applySpreadsheetCommand } from '../packages/sheets/src/index.ts';
import { createWordArtifact } from '../packages/word/src/index.ts';
import { createPresentation, applyPresentationCommand } from '../packages/slides/src/index.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-paint/input');
await mkdir(output, { recursive: true });
const stops = '<a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst>';
const shades = {
  linear: '<a:lin ang="5400000" scaled="1"/>',
  radial: '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>',
  rectangular: '<a:path path="rect"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>',
};
for (const [name, shade] of Object.entries(shades)) for (const type of ['barChart', 'pieChart'] as const) {
  let xml = new TextDecoder().decode(createOoxmlChart({ type, title: `${name} fill`, categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 6] }] }));
  xml = xml.replace(/<c:spPr(?:\s[^>]*)?>[\s\S]*?<\/c:spPr>/, `<c:spPr><a:gradFill>${stops}${shade}</a:gradFill><a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="303030"/></a:solidFill><a:prstDash val="dash"/><a:round/></a:ln></c:spPr>`);
  const created = createChartWorkbook(new TextEncoder().encode(xml));
  const content = { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) };
  const word = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 480, height: 320, content } }] }] });
  const slides = createPresentation();
  const presentation = applyPresentationCommand(slides, { name: 'insert-chart', slideId: slides.document.slides[0]!.id, bounds: { x: 80, y: 80, width: 480, height: 320 }, content });
  const spreadsheet = applySpreadsheetCommand(created.artifact, { name: 'insert-chart', sheetId: String(created.artifact.activeSheet.sheetId), x: 160, y: 100, width: 480, height: 320, content: { xml: content.xml } });
  const stem = `${name}-${type}`;
  await Promise.all([Bun.write(resolve(output, `${stem}.docx`), word.bytes()), Bun.write(resolve(output, `${stem}.pptx`), presentation.bytes()), Bun.write(resolve(output, `${stem}.xlsx`), spreadsheet.bytes())]);
}
console.log(output);
