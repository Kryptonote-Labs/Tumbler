import { writeChartFixture } from './chart-fixture-writer.ts';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';

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
  await writeChartFixture(output, `${name}-${type}`, new TextEncoder().encode(xml));
}
console.log(output);
