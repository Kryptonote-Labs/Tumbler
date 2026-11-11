import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-hidden-grid/input');
await mkdir(output, { recursive: true });
for (const type of ['barChart', 'scatterChart', 'bar3DChart', 'radarChart'] as const) for (const deleted of [false, true]) {
  const created = createOoxmlChart({ type, categories: ['A', 'B', 'C', 'D'], series: [{ name: 'Data', values: [2, 4, 3, 1], xValues: [1, 2, 3, 4] }] });
  const grids = (name: string, color: string) => `<c:${name}><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr></c:${name}>`;
  const xml = new TextDecoder().decode(created).replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g, axis => axis
    .replace(/<c:delete val="[01]"\/>/, `<c:delete val="${deleted ? 1 : 0}"/>`)
    .replace('<c:majorGridlines/>', '')
    .replace('</c:scaling>', '<c:max val="5"/><c:min val="0"/></c:scaling>')
    .replace(/<c:axPos val="[blrt]"\/>/, match => match + grids('majorGridlines', 'FF0000') + grids('minorGridlines', '00AA00'))
    .replace('</c:valAx>', '<c:majorUnit val="1"/><c:minorUnit val="0.5"/></c:valAx>'));
  const name = `${type}-${deleted ? 'hidden' : 'visible'}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`Eight visible/hidden axis-grid cases in DOCX, PPTX and XLSX: ${output}`);
