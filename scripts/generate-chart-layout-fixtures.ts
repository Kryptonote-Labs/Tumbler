import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, OOXML_CHART_TYPES } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-layout/input');
await mkdir(output, { recursive: true });
const base = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', title: 'Manual plot layout', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] }));
const fill = '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>';
const samples = [
  ['automatic', ''],
  ['inner-edge', '<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/><c:w val="0.5"/><c:h val="0.5"/>'],
  ['inner-factor', '<c:layoutTarget val="inner"/><c:x val="0.1"/><c:y val="0.1"/><c:w val="0.5"/><c:h val="0.5"/>'],
  ['inner-edge-size', '<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="edge"/><c:hMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/><c:w val="0.7"/><c:h val="0.75"/>'],
  ['outer-edge', '<c:layoutTarget val="outer"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/><c:w val="0.5"/><c:h val="0.5"/>'],
  ['inner-clamped', '<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.8"/><c:y val="0.9"/><c:w val="0.5"/><c:h val="0.5"/>'],
  ['invalid-default', '<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:x val="-0.1"/><c:y val="0.25"/><c:w val="0.5"/><c:h val="0.5"/>'],
] as const;
for (const [name, manual] of samples) {
  const xml = base.replace('<c:plotArea><c:layout/>', `<c:plotArea><c:layout>${manual && `<c:manualLayout>${manual}</c:manualLayout>`}</c:layout>`).replace('</c:plotArea>', `${fill}</c:plotArea>`);
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
for (const type of OOXML_CHART_TYPES) {
  const series = [
    { name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] },
    { name: 'Other', values: [3, 2, 4], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] },
    { name: 'Close', values: [2, 3, 3], xValues: [1, 2, 3], bubbleSizes: [2, 3, 1] },
  ];
  const source = new TextDecoder().decode(createOoxmlChart({ type, title: type, categories: ['A', 'B', 'C'], series }));
  const xml = source.replace('<c:plotArea><c:layout/>', `<c:plotArea><c:layout><c:manualLayout>${samples[1][1]}</c:manualLayout></c:layout>`).replace('</c:plotArea>', `${fill}</c:plotArea>`);
  await Bun.write(resolve(output, `family-${type}.xml`), xml);
  await writeChartFixture(output, `family-${type}`, new TextEncoder().encode(xml));
}
console.log(`${samples.length + OOXML_CHART_TYPES.length} manual layout samples in DOCX, PPTX and XLSX: ${output}`);
