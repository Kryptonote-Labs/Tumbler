import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { chartBytesToBase64, createOoxmlChart, type ChartResources } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-resources/input');
await mkdir(output, { recursive: true });
const canvas = createCanvas(128, 128), context = canvas.getContext('2d');
for (const [index, color] of ['#4472c4', '#ed7d31', '#70ad47', '#ffc000'].entries()) {
  context.fillStyle = color; context.fillRect(index % 2 * 64, Math.floor(index / 2) * 64, 64, 64);
}
const resources: ChartResources = {
  parts: [{ key: 'texture', contentType: 'image/png', data: chartBytesToBase64(canvas.toBuffer('image/png')) }],
  relationships: [{ id: 'texture', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'texture' }],
};
for (const type of ['barChart', 'pieChart'] as const) {
  const source = createOoxmlChart({ type, title: 'Picture fill resource', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const fill = '<c:spPr><a:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="texture"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></c:spPr>';
  let xml = new TextDecoder().decode(source);
  if (xml.includes('<c:spPr>')) xml = xml.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, fill);
  else xml = xml.replace('</c:tx>', `</c:tx>${fill}`);
  await writeChartFixture(output, `picture-${type}`, new TextEncoder().encode(xml), { resources });
}
console.log(output);
