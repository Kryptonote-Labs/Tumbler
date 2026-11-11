import { resolve } from 'node:path';
import { DRAWING_PATTERN_PRESETS } from '../packages/ooxml/src/pattern-presets.ts';
import { beginPackageTransaction } from '../packages/opc/src/index.ts';
import { createOoxmlChart, chartBytesToBase64 } from '../packages/charts/src/index.ts';
import { createChartWorkbook } from '../packages/sheets/src/index.ts';
import { createPresentation, openPresentationArtifact, applyPresentationCommand } from '../packages/slides/src/index.ts';

const output = resolve(process.argv[2] ?? 'packages/charts/test/fixtures/chart-pattern-reference.pptx');
const patternFill = (preset: string) => `<a:pattFill prst="${preset}"><a:fgClr><a:srgbClr val="000000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>`;
let presentation = createPresentation();
for (const [index, preset] of DRAWING_PATTERN_PRESETS.entries()) {
  const page = Math.floor(index / 6), local = index % 6;
  if (index && !local) presentation = applyPresentationCommand(presentation, { name: 'insert-slide', index: page });
  const slideId = presentation.document.slides[page]!.id;
  const x = 40 + local % 3 * 400, y = 80 + Math.floor(local / 3) * 310;
  presentation = applyPresentationCommand(presentation, { name: 'insert-object', slideId, bounds: { x, y: y - 35, width: 350, height: 30 }, object: { kind: 'shape', text: preset, fontSize: 18 } });
  presentation = applyPresentationCommand(presentation, { name: 'insert-object', slideId, bounds: { x, y, width: 160, height: 160 }, object: { kind: 'shape', geometry: 'rect', fill: '#FFFFFF', stroke: 'none' } });
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Pattern', values: [4] }] }))
    .replaceAll('<c:delete val="0"/>', '<c:delete val="1"/>');
  const series = source.match(/<c:ser>[\s\S]*?<\/c:ser>/)![0];
  const painted = source.replace(series, series.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, `<c:spPr>${patternFill(preset)}</c:spPr>`));
  const data = createChartWorkbook(new TextEncoder().encode(painted));
  presentation = applyPresentationCommand(presentation, { name: 'insert-chart', slideId, bounds: { x: x + 170, y, width: 220, height: 160 }, content: { xml: new TextDecoder().decode(data.source), workbook: chartBytesToBase64(data.artifact.bytes()) } });
}
const pkg = presentation.document.package, edit = beginPackageTransaction(pkg);
for (const [page, slide] of presentation.document.slides.entries()) {
  const part = pkg.getPart(slide.part)!;
  let source = new TextDecoder().decode(pkg.readPart(part)), local = 0;
  source = source.replace(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g, shape => {
    if (!shape.includes('<a:srgbClr val="FFFFFF"/>')) return shape;
    const preset = DRAWING_PATTERN_PRESETS[page * 6 + local++]!;
    return shape.replace(/<a:solidFill><a:srgbClr val="FFFFFF"\/><\/a:solidFill>/, patternFill(preset));
  });
  if (local !== 6) throw Error(`Expected six reference rectangles on page ${page + 1}.`);
  edit.replacePart(part.name, new TextEncoder().encode(source));
}
await Bun.write(output, openPresentationArtifact(edit.commit()).bytes());
console.log(output);
