import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, OOXML_CHART_TYPES } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-legend/input');
await mkdir(output, { recursive: true });
const entries = '<c:legendEntry><c:idx val="1"/><c:delete/></c:legendEntry><c:legendEntry><c:idx val="2"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1800" b="1" i="1"><a:solidFill><a:schemeClr val="accent3"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr></a:p></c:txPr></c:legendEntry>';
const series = ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({ name, values: [2 + index, 4 + index, 3 + index], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] }));
for (const type of OOXML_CHART_TYPES) {
  const xml = new TextDecoder().decode(createOoxmlChart({ type, title: type, categories: ['A', 'B', 'C'], series }))
    .replace('<c:legendPos val="b"/>', `<c:legendPos val="b"/>${entries}`);
  await Bun.write(resolve(output, `${type}.xml`), xml);
  await writeChartFixture(output, type, new TextEncoder().encode(xml));
}
console.log(`${OOXML_CHART_TYPES.length} legend samples in DOCX, PPTX and XLSX: ${output}`);
