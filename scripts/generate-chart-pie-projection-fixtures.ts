import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-pie-projection/input');
await mkdir(output, { recursive: true });
const cases = [
  ...[0, 90, 180, 270].map(rotation => ({ name: `rotation-${rotation}`, rotation, extra: '' })),
  { name: 'height-100', rotation: 0, extra: '<c:hPercent val="100"/>' },
  { name: 'height-200', rotation: 0, extra: '<c:hPercent val="200"/>' },
  { name: 'perspective-0', rotation: 0, extra: '<c:perspective val="0"/>' },
];
for (const {name: suffix, rotation, extra} of cases) {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'pie3DChart', categories: ['North', 'East', 'West'], series: [{ name: 'Data', values: [6, 3, 1] }] }));
  const labels = '<c:dLbls><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr></a:p></c:txPr><c:dLblPos val="ctr"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
  const frame = '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="0.1"/><c:y val="0.1"/><c:w val="0.8"/><c:h val="0.8"/></c:manualLayout></c:layout>';
  const xml = source.replace('<c:rotY val="20"/>', `<c:rotY val="${rotation}"/>`).replace('<c:rotY', `${extra.startsWith('<c:hPercent') ? extra : ''}<c:rotY`).replace('<c:rAngAx val="1"/>', `<c:rAngAx val="1"/>${extra.startsWith('<c:perspective') ? extra : ''}`).replace('<c:plotArea><c:layout/>', `<c:plotArea>${frame}`).replace('<c:cat>', `${labels}<c:cat>`).replace(/<c:legend>[\s\S]*?<\/c:legend>/, '');
  const name = `pie3d-${suffix}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`${cases.length} controlled 3-D pie cases generated in DOCX, PPTX and XLSX.`);
