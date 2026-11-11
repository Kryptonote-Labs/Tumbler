import { writeChartFixture } from './chart-fixture-writer.ts';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart } from '../packages/charts/src/index.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-stock/input');
await mkdir(output, { recursive: true });
for (const open of [false, true]) {
  const bytes = createOoxmlChart({ type: 'stockChart', title: open ? 'Open-high-low-close' : 'High-low-close', categories: ['Mon', 'Tue', 'Wed', 'Thu'], series: [
    ...(open ? [{ name: 'Open', values: [4, 8, 5, 9] }] : []), { name: 'High', values: [9, 10, 8, 12] }, { name: 'Low', values: [2, 3, 3, 4] }, { name: 'Close', values: [7, 5, 7, 6] },
  ] });
  await writeChartFixture(output, open ? 'open-high-low-close' : 'high-low-close', bytes);
}
console.log(output);
