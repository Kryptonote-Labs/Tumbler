import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, updateChartTitle } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-plain-title/input');
await mkdir(output, { recursive: true });
for (const conformance of ['strict', 'transitional'] as const) {
  const created = createOoxmlChart({ type: 'barChart', conformance, title: 'Initial', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const paragraph = '<a:p><a:pPr algn="l"><a:defRPr sz="1400"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr><a:r><a:rPr b="1"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr><a:t>North</a:t></a:r><a:br/><a:fld id="{58F21D69-5273-4DAC-91F4-A80D598243B0}" type="slidenum"><a:rPr i="1"/><a:t>42</a:t></a:fld><a:endParaRPr sz="1800"/></a:p><a:p><a:pPr algn="r"><a:defRPr sz="1200"/></a:pPr><a:r><a:rPr u="dbl"/><a:t>South</a:t></a:r><a:endParaRPr sz="1400"/></a:p>';
  const source = new TextEncoder().encode(new TextDecoder().decode(created).replace(/<a:p\b[\s\S]*?<\/a:p>/, paragraph));
  const cases = [
    ['before', source],
    ['disjoint', updateChartTitle(source, 'East\n42\nWest')],
    ['inserted', updateChartTitle(source, 'Northbound\n4\n2\nSouth')],
  ] as const;
  for (const [stage, bytes] of cases) {
    const name = `${conformance}-${stage}`;
    await Bun.write(resolve(output, `${name}.xml`), bytes);
    await writeChartFixture(output, name, bytes);
  }
}
console.log(`Six plain title cases in DOCX, PPTX and XLSX: ${output}`);
