import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-pie-label/input');
await mkdir(output, { recursive: true });
const variants = [
  { name: 'center', position: 'ctr' }, { name: 'inside', position: 'inEnd' },
  { name: 'outside', position: 'outEnd' }, { name: 'manual-leader', position: 'outEnd', manual: true },
] as const;
for (const type of ['pieChart', 'pie3DChart'] as const) for (const variant of variants) {
  const source = createOoxmlChart({ type, categories: ['North', 'East', 'West'], series: [{ name: 'Data', values: [6, 3, 1] }] });
  const point = 'manual' in variant ? '<c:dLbl><c:idx val="1"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.85"/><c:y val="0.05"/></c:manualLayout></c:layout><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>' : '';
  const font = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr></a:p></c:txPr>';
  const labels = `<c:dLbls>${point}${font}<c:dLblPos val="${variant.position}"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/><c:leaderLines><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="FF00FF"/></a:solidFill></a:ln></c:spPr></c:leaderLines></c:dLbls>`;
  const plot = '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="0.1"/><c:y val="0.1"/><c:w val="0.8"/><c:h val="0.8"/></c:manualLayout></c:layout>';
  const xml = new TextDecoder().decode(source).replace('<c:cat>', `${labels}<c:cat>`).replace('<c:plotArea><c:layout/>', `<c:plotArea>${plot}`).replace(/<c:legend>[\s\S]*?<\/c:legend>/, '');
  const name = `${type}-${variant.name}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml));
}
console.log(`Eight pie label placement cases in DOCX, PPTX and XLSX: ${output}`);
