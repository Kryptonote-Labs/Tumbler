import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, OOXML_CHART_TYPES, type OoxmlChartType } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-legend-layout/input');
await mkdir(output, { recursive: true });
const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const style = '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr></a:p></c:txPr>';
const cases = [
  ['bottom', 'b', false, .2, .25, .5, .5, 'factor'],
  ['right', 'r', false, .2, .25, .5, .5, 'factor'],
  ['bottom-overlay', 'b', true, .2, .25, .5, .5, 'factor'],
  ['narrow', 'r', false, .6, .2, .25, .65, 'factor'],
  ['wide', 'r', false, .1, .6, .8, .2, 'factor'],
  ['edges', 'b', false, .2, .25, .7, .75, 'edge'],
] as const;
function legend(sample: typeof cases[number], entries = '') {
  const [, position, overlay, x, y, width, height, mode] = sample;
  return `<c:legend><c:legendPos val="${position}"/>${entries}<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="${mode}"/><c:hMode val="${mode}"/><c:x val="${x}"/><c:y val="${y}"/><c:w val="${width}"/><c:h val="${height}"/></c:manualLayout></c:layout><c:overlay val="${overlay ? 1 : 0}"/>${style}</c:legend>`;
}
async function sample(name: string, type: OoxmlChartType, legendXml: string, count: number) {
  const source = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: names.slice(0, count).map((name, index) => ({ name, values: [2 + index, 4 + index, 3 + index], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] })) }));
  const xml = source.replace(/<c:legend>[\s\S]*?<\/c:legend>/, legendXml);
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
for (const entry of cases) await sample(entry[0], 'barChart', legend(entry), 6);
for (const type of OOXML_CHART_TYPES) await sample(`family-${type}`, type, legend(cases[0], '<c:legendEntry><c:idx val="1"/><c:delete/></c:legendEntry>'), 3);
console.log(`${cases.length + OOXML_CHART_TYPES.length} manual legend samples in DOCX, PPTX and XLSX: ${output}`);
