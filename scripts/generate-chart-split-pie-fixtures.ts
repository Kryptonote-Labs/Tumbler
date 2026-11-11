import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-split-pie/input');
await mkdir(output, { recursive: true });
const colors = ['FF0000', '00FF00', '0000FF', 'FF00FF', 'FF8000', '00FFFF', '808080'];
const plot = '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="0.05"/><c:y val="0.05"/><c:w val="0.9"/><c:h val="0.9"/></c:manualLayout></c:layout>';
const variants = [
  { name: 'default' }, { name: 'size-50', size: 50 }, { name: 'size-150', size: 150 },
  { name: 'gap-0', gap: 0 }, { name: 'gap-200', gap: 200 }, { name: 'labels', labels: true },
] as const;
for (const splitType of ['pie', 'bar'] as const) for (const variant of variants) {
  const source = createOoxmlChart({ type: 'ofPieChart', splitType, categories: ['A', 'B', 'C', 'D', 'E', 'F'], series: [{ name: 'Data', values: [6, 5, 4, 3, 2, 1] }] });
  const points = colors.map((color, index) => `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:dPt>`).join('');
  const labels = 'labels' in variant ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>|</c:separator></c:dLbls>' : '';
  const properties = `${'gap' in variant ? `<c:gapWidth val="${variant.gap}"/>` : ''}<c:splitType val="pos"/><c:splitPos val="2"/>${'size' in variant ? `<c:secondPieSize val="${variant.size}"/>` : ''}<c:serLines><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="202020"/></a:solidFill></a:ln></c:spPr></c:serLines>`;
  const xml = new TextDecoder().decode(source).replace('<c:serLines/>', '').replace('<c:cat>', `${points}${labels}<c:cat>`).replace('<c:plotArea><c:layout/>', `<c:plotArea>${plot}`).replace(/<c:legend>[\s\S]*?<\/c:legend>/, '').replace('</c:ofPieChart>', `${properties}</c:ofPieChart>`);
  const name = `${splitType}-${variant.name}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`Twelve split-pie layout cases in DOCX, PPTX and XLSX: ${output}`);
