import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, OOXML_CHART_TYPES } from '../packages/charts/src/index.ts';
import { beginPackageTransaction, openOpcPackage } from '../packages/opc/src/index.ts';

// Keep chart layout and host theme identical across generated chart-type references.
const output = resolve(process.argv[2] ?? 'compatibility-results/chart-authoring/input');
await mkdir(output, { recursive: true });
const template = openOpcPackage(await Bun.file(new URL('../apps/docs/static/samples/workspace-brief.pptx', import.meta.url)).bytes());
const chart = template.parts.find(part => part.contentType === 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
if (!chart) throw new Error('Chart reference template has no chart.');
for (const type of OOXML_CHART_TYPES) {
  const bytes = createOoxmlChart({
    type,
    title: type,
    categories: ['January', 'February', 'March', 'April'],
    series: [
      { name: type === 'stockChart' ? 'High' : 'Revenue', values: [12, 18, 15, 22], xValues: [1, 2, 3, 4], bubbleSizes: [8, 12, 6, 16] },
      { name: type === 'stockChart' ? 'Low' : 'Costs', values: [6, 10, 8, 12], xValues: [1, 2, 3, 4], bubbleSizes: [4, 8, 3, 9] },
      ...(type === 'stockChart' ? [{ name: 'Close', values: [9, 14, 12, 18] }] : []),
    ],
  });
  await Bun.write(resolve(output, `${type}.pptx`), beginPackageTransaction(template).replacePart(chart.name, bytes).commit());
  await Bun.write(resolve(output, `${type}.xml`), bytes);
}
console.log(output);
