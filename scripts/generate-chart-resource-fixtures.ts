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
await Bun.write(resolve(output, 'picture.png'), canvas.toBuffer('image/png'));
const modes = {
  stretch: { attributes: '', opacity: '', geometry: '<a:stretch><a:fillRect/></a:stretch>' },
  'crop-inset': { attributes: '', opacity: '<a:alphaModFix amt="60000"/>', geometry: '<a:srcRect l="25000" t="10000" r="10000" b="25000"/><a:stretch><a:fillRect l="10000" t="15000" r="10000" b="15000"/></a:stretch>' },
  tile: { attributes: '', opacity: '', geometry: '<a:tile sx="25000" sy="25000" algn="ctr" tx="95250" ty="-95250"/>' },
  mirror: { attributes: '', opacity: '', geometry: '<a:tile sx="25000" sy="25000" algn="br" flip="xy"/>' },
  'crop-tile': { attributes: '', opacity: '', geometry: '<a:srcRect l="25000" r="25000"/><a:tile sx="50000" sy="25000" algn="tl" flip="x"/>' },
  dpi: { attributes: ' dpi="192"', opacity: '', geometry: '<a:tile sx="50000" sy="50000" algn="tl"/>' },
};
for (const [mode, settings] of Object.entries(modes)) for (const type of ['barChart', 'pieChart'] as const) {
  const source = createOoxmlChart({ type, title: 'Picture fill resource', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const fill = `<c:spPr><a:blipFill${settings.attributes}><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="texture">${settings.opacity}</a:blip>${settings.geometry}</a:blipFill></c:spPr>`;
  let xml = new TextDecoder().decode(source);
  if (xml.includes('<c:spPr>')) xml = xml.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, fill);
  else xml = xml.replace('</c:tx>', `</c:tx>${fill}`);
  await writeChartFixture(output, `picture-${mode}-${type}`, new TextEncoder().encode(xml), { resources });
}
console.log(output);
