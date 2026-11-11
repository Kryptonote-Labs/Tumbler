import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { chartBytesToBase64, createOoxmlChart, updateChartTitle, type ChartResources } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-text-box/input');
await mkdir(output, { recursive: true });
const image = createCanvas(40, 20), imageContext = image.getContext('2d');
imageContext.fillStyle = '#FF0000'; imageContext.fillRect(0, 0, 20, 20);
imageContext.fillStyle = '#0000FF'; imageContext.fillRect(20, 0, 20, 20);
const resources: ChartResources = { parts: [{ key: 'image', contentType: 'image/png', data: chartBytesToBase64(image.toBuffer('image/png')) }], relationships: [{ id: 'image', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'image' }] };
const fills = {
  solid: '<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>',
  gradient: '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>',
  picture: '<a:blipFill rotWithShape="1"><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="image"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>',
  pattern: '<a:pattFill prst="ltHorz"><a:fgClr><a:srgbClr val="00FF00"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>',
};
const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/></c:manualLayout></c:layout>';
const series = [{ name: 'Data', values: [2, 4, 3] }];
let count = 0;
for (const [kind, fill] of Object.entries(fills)) for (const owner of ['title', 'point', 'trendline', 'units'] as const) for (const angle of owner === 'title' ? [0, 45, 90] : [45]) {
  const shape = `<c:spPr>${fill}<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></c:spPr>`;
  const rich = `<c:tx><c:rich><a:bodyPr rot="${angle * 60000}"/><a:lstStyle/><a:p><a:r><a:rPr sz="1800" b="1"><a:latin typeface="DejaVu Sans"/></a:rPr><a:t>Quarterly</a:t></a:r></a:p></c:rich></c:tx>`;
  const original = createOoxmlChart({ type: owner === 'trendline' ? 'lineChart' : 'barChart', categories: ['A', 'B', 'C'], series });
  let xml = new TextDecoder().decode(original);
  if (owner === 'title') xml = new TextDecoder().decode(updateChartTitle(original, [{ runs: [{ text: 'Quarterly', style: { fontFamily: 'DejaVu Sans', fontSize: 18, bold: true } }] }]))
    .replace('<a:bodyPr/>', `<a:bodyPr rot="${angle * 60000}"/>`).replace('<c:overlay val="0"/>', `${manual}<c:overlay val="0"/>`).replace('</c:title>', `${shape}</c:title>`);
  else if (owner === 'point') xml = xml.replace('<c:cat>', `<c:dLbls><c:dLbl><c:idx val="0"/>${manual}${rich}${shape}</c:dLbl></c:dLbls><c:cat>`);
  else if (owner === 'trendline') xml = xml.replace('<c:cat>', `<c:trendline><c:trendlineType val="linear"/><c:dispEq val="1"/><c:trendlineLbl>${manual}${rich}${shape}</c:trendlineLbl></c:trendline><c:cat>`);
  else xml = xml.replace('</c:valAx>', `<c:dispUnits><c:builtInUnit val="thousands"/><c:dispUnitsLbl>${manual}${rich}${shape}</c:dispUnitsLbl></c:dispUnits></c:valAx>`);
  const name = `${owner}-${kind}-${angle}`;
  await Bun.write(resolve(output, `${name}.xml`), xml);
  await writeChartFixture(output, name, new TextEncoder().encode(xml), kind === 'picture' ? { resources } : {});
  count++;
}
console.log(`${count} transformed text-box samples in DOCX, PPTX and XLSX: ${output}`);
