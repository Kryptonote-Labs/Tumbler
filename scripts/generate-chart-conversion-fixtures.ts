import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, convertChartType, parseOoxmlChart, readChartData } from '../packages/charts/src/index.ts';
import { CHART_TYPE_FAMILIES } from '../packages/svelte/src/chart-properties.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-conversions/input');
await mkdir(output, { recursive: true });
const categories = ['Jan', 'Feb'];
const series = [{ name: 'High', values: [10, 12] }, { name: 'Low', values: [3, 4] }, { name: 'Close', values: [7, 8] }];
let source = createOoxmlChart({ type: 'barChart', categories, series });
let index = 0;
for (const family of CHART_TYPE_FAMILIES) for (const option of family.options) {
  source = convertChartType(source, option.change);
  const data = readChartData(source)[0]!;
  if (JSON.stringify(data.series.map(current => current.values?.values)) !== JSON.stringify(series.map(current => current.values))) throw Error(`Values changed at ${option.label}`);
  if (!['scatterChart', 'bubbleChart'].includes(option.change.type) && data.series.some(current => JSON.stringify(current.categories?.values) !== JSON.stringify(categories))) throw Error(`Categories changed at ${option.label}`);
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw Error(model.reason);
  if (option.change.type === 'barChart' && option.change.grouping === 'clustered' && model.overlap !== 0) throw Error(`Clustered columns overlap at ${option.label}`);
  const name = `${String(++index).padStart(2, '0')}-${option.label.toLowerCase().replaceAll('%', 'pct').replace(/[^a-z0-9]+/g, '-')}`;
  await Bun.write(resolve(output, `${name}.xml`), source);
  await writeChartFixture(output, name, source);
}
console.log(`All ${index} consecutive gallery conversions retained values and categories; DOCX, PPTX and XLSX generated.`);
