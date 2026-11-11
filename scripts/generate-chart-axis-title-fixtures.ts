import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-axis-titles/input');
await mkdir(output, { recursive: true });
const series = [{ name: 'One', values: [2, 4, 3], xValues: [1, 2, 3] }, { name: 'Two', values: [1, 3, 2], xValues: [1, 2, 3] }];
const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/></c:manualLayout></c:layout>';
let count = 0;
for (const type of ['barChart', 'scatterChart', 'bar3DChart', 'radarChart', 'surfaceChart', 'surface3DChart'] as const) {
  const original = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series }));
  for (const owner of ['catAx', 'valAx', 'serAx'] as const) {
    if (!original.includes(`<c:${owner}>`)) continue;
    for (const angle of [0, 45]) {
      const rich = `<c:tx><c:rich><a:bodyPr rot="${angle * 60000}"/><a:lstStyle/><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="DejaVu Sans"/></a:rPr><a:t>${owner}</a:t></a:r><a:r><a:rPr sz="1200" i="1" u="sng"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill><a:latin typeface="DejaVu Sans"/></a:rPr><a:t> USD</a:t></a:r></a:p></c:rich></c:tx>`;
      const shape = '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:ln></c:spPr>';
      const title = `<c:title>${rich}${manual}${shape}</c:title>`;
      const xml = original.replace(new RegExp(`(<c:${owner}>[\\s\\S]*?<c:axPos\\b[^>]*\\/>)(<c:majorGridlines\\/>|)`), `$1$2${title}`);
      const name = `${type}-${owner}-${angle}`;
      await Bun.write(resolve(output, `${name}.xml`), xml);
      await writeChartFixture(output, name, new TextEncoder().encode(xml));
      count++;
    }
  }
}
console.log(`${count} rich axis-title cases in DOCX, PPTX and XLSX: ${output}`);
