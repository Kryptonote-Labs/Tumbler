import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-surface/input');
await mkdir(output, { recursive: true });
for (const type of ['surfaceChart', 'surface3DChart'] as const) for (const wireframe of [false, true]) {
  const source = createOoxmlChart({ type, wireframe, title: `${wireframe ? 'Wireframe' : 'Filled'} surface`, categories: ['A', 'B', 'C'], series: [{ name: 'Front', values: [1, 6, 2] }, { name: 'Middle', values: [3, 2, 5] }, { name: 'Back', values: [5, 4, 1] }] });
  const bands = '<c:bandFmts><c:bandFmt><c:idx val="2"/><c:spPr><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="800080"/></a:solidFill></a:ln></c:spPr></c:bandFmt></c:bandFmts>';
  const xml = new TextDecoder().decode(source).replace('<c:axId val="1"/>', `${bands}<c:axId val="1"/>`);
  await writeChartFixture(output, `${type}-${wireframe ? 'wireframe' : 'filled'}`, new TextEncoder().encode(xml));
}
console.log(output);
