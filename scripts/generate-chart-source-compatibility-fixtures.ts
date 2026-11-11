import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, convertChartType, convertChartConformance } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-source-compatibility/input');
await mkdir(output, { recursive: true });
const data = { categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3] }] };
for (const scatterStyle of ['none', 'marker', 'line', 'lineMarker', 'smooth', 'smoothMarker'] as const) {
  await writeChartFixture(output, `scatter-${scatterStyle}`, createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle, title: `Scatter ${scatterStyle}` }));
}
for (const type of ['pieChart', 'pie3DChart', 'doughnutChart'] as const) await writeChartFixture(output, type, createOoxmlChart({ ...data, type, title: type }));
const original = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'scatterChart', scatterStyle: 'line', title: 'Retained red line' })).replace('<a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>', '<a:ln w="25400"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:prstDash val="dash"/></a:ln>');
const hidden = convertChartType(new TextEncoder().encode(original), { type: 'scatterChart', scatterStyle: 'marker' });
await writeChartFixture(output, 'scatter-inactive-line', hidden);
await writeChartFixture(output, 'scatter-restored-line', convertChartType(hidden, { type: 'scatterChart', scatterStyle: 'line' }));
await writeChartFixture(output, 'scatter-strict-restored', convertChartType(convertChartConformance(hidden, 'strict'), { type: 'scatterChart', scatterStyle: 'line' }));
console.log(output);
