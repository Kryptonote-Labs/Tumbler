import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHART_BAR_SHAPES, createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-three-d/input');
await mkdir(output, { recursive: true });
const data = { categories: ['A', 'B', 'C'], series: [{ name: 'One', values: [2, 4, 3] }, { name: 'Two', values: [3, 2, 5] }] };
for (const shape of CHART_BAR_SHAPES) for (const grouping of ['clustered', 'standard'] as const) {
  const bytes = createOoxmlChart({ ...data, type: 'bar3DChart', shape, grouping, title: `${shape} ${grouping}` });
  await writeChartFixture(output, `${shape}-${grouping}`, bytes);
}
for (const shape of ['cone', 'pyramid', 'cylinder'] as const) await writeChartFixture(output, `${shape}-stacked`, createOoxmlChart({ ...data, type: 'bar3DChart', shape, grouping: 'stacked', title: `${shape} stacked` }));
for (const percent of [50, 200]) {
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'bar3DChart', title: `Height ${percent}%` })).replace('<c:rotY', `<c:hPercent val="${percent}"/><c:rotY`);
  await writeChartFixture(output, `height-${percent}`, new TextEncoder().encode(source));
}
for (const perspective of [120, 240]) {
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'bar3DChart', title: `Perspective ${perspective}` })).replace('<c:rAngAx val="1"/>', `<c:rAngAx val="0"/><c:perspective val="${perspective}"/>`);
  await writeChartFixture(output, `perspective-${perspective}`, new TextEncoder().encode(source));
}
for (const [name, thickness, rotation] of [['walls-flat', 0, 20], ['walls-thick', 20, 20], ['walls-rotated', 20, 225]] as const) {
  const walls = ['floor', 'sideWall', 'backWall'].map((wall, index) => `<c:${wall}><c:thickness val="${thickness}"/><c:spPr><a:solidFill><a:schemeClr val="accent${index + 4}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:${wall}>`).join('');
  const source = new TextDecoder().decode(createOoxmlChart({ ...data, type: 'bar3DChart', title: name })).replace('<c:plotArea>', `${walls}<c:plotArea>`).replace('<c:rotY val="20"/>', `<c:rotY val="${rotation}"/>`);
  await writeChartFixture(output, name, new TextEncoder().encode(source));
}
console.log(output);
