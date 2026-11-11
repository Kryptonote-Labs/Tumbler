import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, OOXML_CHART_TYPES, updateChartTitle } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-text/input');
await mkdir(output, { recursive: true });
const manual = (extra = '', mode = 'edge') => `<c:layout><c:manualLayout><c:xMode val="${mode}"/><c:yMode val="${mode}"/><c:x val="0.2"/><c:y val="0.25"/>${extra}</c:manualLayout></c:layout>`;
const rich = '<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="DejaVu Sans"/></a:rPr><a:t>Custom label</a:t></a:r></a:p></c:rich></c:tx>';
const series = [
  { name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] },
  { name: 'Other', values: [3, 2, 4], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] },
  { name: 'Close', values: [2, 3, 3], xValues: [1, 2, 3], bubbleSizes: [2, 3, 1] },
];
const title = [{ runs: [{ text: 'Positioned title', style: { fontSize: 18, fontFamily: 'DejaVu Sans', bold: true, color: { kind: 'rgb' as const, value: '#FF0000' } } }] }];
const samples: Array<readonly [string, string]> = [];
for (const type of OOXML_CHART_TYPES) {
  const source = new TextDecoder().decode(updateChartTitle(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series }), title));
  samples.push([`title-${type}`, source.replace('<c:overlay val="0"/>', `${manual()}<c:overlay val="0"/>`)]);
}
const base = samples[0]![1];
samples.push(['title-ignored-size', base.replace(manual(), manual('<c:w val="0.01"/><c:h val="0.01"/>'))]);
samples.push(['title-factor', base.replace(manual(), manual('', 'factor'))]);
samples.push(['title-incomplete', base.replace('<c:y val="0.25"/>', '')]);
samples.push(['point-label', base.replace('<c:cat>', `<c:dLbls><c:dLbl><c:idx val="0"/>${manual()}${rich}</c:dLbl><c:showVal val="0"/></c:dLbls><c:cat>`)]);
samples.push(['display-units', base.replace('</c:valAx>', `<c:dispUnits><c:builtInUnit val="thousands"/><c:dispUnitsLbl>${manual()}${rich}</c:dispUnitsLbl></c:dispUnits></c:valAx>`)]);
const line = new TextDecoder().decode(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B', 'C'], series: [series[0]!] }));
samples.push(['trendline-label', line.replace('<c:cat>', `<c:trendline><c:trendlineType val="linear"/><c:dispEq val="1"/><c:trendlineLbl>${manual()}${rich}</c:trendlineLbl></c:trendline><c:cat>`)]);
for (const [name, xml] of samples) {
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`${samples.length} text layout samples in DOCX, PPTX and XLSX: ${output}`);
