import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-pie-values/input');
await mkdir(output, { recursive: true });
for (const type of ['pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart'] as const) for (const splitType of type === 'ofPieChart' ? ['pie', 'bar'] as const : [undefined]) {
  const source = createOoxmlChart({ type, ...(splitType ? { splitType } : {}), categories: ['Negative', 'Positive', 'Smaller'], series: [{ name: 'Data', values: [-4, 3, 2] }] });
  const colors = ['FF0000', '00FF00', '0000FF'].map((color, index) => `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`).join('');
  const labels = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>|</c:separator></c:dLbls>';
  const xml = new TextDecoder().decode(source).replace('<c:cat>', `${colors}${labels}<c:cat>`)
    .replace('</c:ofPieChart>', '<c:splitType val="pos"/><c:splitPos val="2"/></c:ofPieChart>');
  const name = `${type}${splitType ? `-${splitType}` : ''}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`Five negative pie-value cases in DOCX, PPTX and XLSX: ${output}`);
