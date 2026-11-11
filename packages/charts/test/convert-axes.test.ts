import { expect, test } from 'bun:test';
import { createOoxmlChart, convertChartType, parseOoxmlChart, readChartData, type OoxmlChartType } from '../src/index.ts';
import { chartXml, standaloneChartElement } from '../src/source-xml.ts';

const base = { categories: ['A', 'B'], series: [{ name: 'High', values: [10, 12] }, { name: 'Low', values: [3, 4] }, { name: 'Close', values: [7, 8] }] };
const kinds = new Set(['catAx', 'dateAx', 'valAx', 'serAx']);
const sequence: readonly OoxmlChartType[] = ['bar3DChart', 'barChart', 'line3DChart', 'lineChart', 'area3DChart', 'areaChart', 'surface3DChart', 'barChart'];
for (const conformance of ['transitional', 'strict'] as const) test(`repeated type changes keep only referenced native axes (${conformance})`, () => {
  let bytes = createOoxmlChart({ ...base, type: 'barChart', conformance });
  for (const type of sequence) {
    bytes = convertChartType(bytes, { type });
    const source = chartXml(bytes);
    const ids = new Set(source.children(source.plotArea).filter(node => node.localName.endsWith('Chart')).flatMap(plot => source.children(plot, 'axId').map(node => node.attributes.find(attribute => attribute.localName === 'val')?.value)));
    const axes = source.children(source.plotArea).filter(node => kinds.has(node.localName));
    expect(axes.map(axis => source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value).sort()).toEqual([...ids].sort());
    expect(readChartData(bytes)[0]?.series.map(series => series.values?.values)).toEqual(base.series.map(series => series.values));
  }
});

test('inactive depth-axis formatting survives XY and pie conversions', () => {
  const source = chartXml(createOoxmlChart({ ...base, type: 'bar3DChart' }));
  const depth = source.children(source.plotArea, 'serAx')[0]!;
  const xml = new TextDecoder().decode(source.document.originalBytes());
  const raw = standaloneChartElement(source.document, depth);
  let bytes: Uint8Array = new TextEncoder().encode(xml.replace(/<c:serAx>[\s\S]*?<\/c:serAx>/, raw.replace('</c:scaling>', '<c:max val="42"/></c:scaling>')));
  for (const type of ['pieChart', 'scatterChart', 'line3DChart', 'bar3DChart'] as const) bytes = convertChartType(bytes, { type });
  const model = parseOoxmlChart(bytes, 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.axes.find(axis => axis.kind === 'series')?.maximum).toBe(42);
});

test('new axes precede the plot data table, shape properties and extension list', () => {
  const original = new TextDecoder().decode(createOoxmlChart({ ...base, type: 'barChart' })).replace('</c:plotArea>', '<c:spPr><a:noFill/></c:spPr><c:extLst/></c:plotArea>');
  const source = chartXml(convertChartType(new TextEncoder().encode(original), { type: 'scatterChart' }));
  const children = source.children(source.plotArea);
  const lastAxis = children.findLastIndex(node => kinds.has(node.localName));
  expect(lastAxis).toBeLessThan(children.findIndex(node => node.localName === 'spPr'));
  expect(lastAxis).toBeLessThan(children.findIndex(node => node.localName === 'extLst'));
});

test('a secondary plot conversion keeps shared primary axes unchanged', () => {
  const xml = new TextDecoder().decode(createOoxmlChart({ ...base, type: 'lineChart' }));
  const second = xml.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)![0].replace('<c:axId val="2"/>', '<c:axId val="3"/>');
  const secondaryAxis = xml.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)![0].replace('<c:axId val="2"/>', '<c:axId val="3"/>').replace('<c:axPos val="l"/>', '<c:axPos val="r"/>');
  const before = chartXml(new TextEncoder().encode(xml.replace('</c:lineChart>', `</c:lineChart>${second}`).replace('</c:plotArea>', `${secondaryAxis}</c:plotArea>`)));
  const after = chartXml(convertChartType(before.document.originalBytes(), { type: 'areaChart' }, 1));
  for (const kind of ['catAx', 'valAx']) {
    expect(standaloneChartElement(after.document, after.children(after.plotArea, kind)[0]!)).toBe(standaloneChartElement(before.document, before.children(before.plotArea, kind)[0]!));
  }
});

test('axis allocation handles the largest schema-valid unsigned ID', () => {
  const xml = new TextDecoder().decode(createOoxmlChart({ ...base, type: 'barChart' })).replaceAll('<c:axId val="1"/>', '<c:axId val="4294967295"/>').replaceAll('<c:crossAx val="1"/>', '<c:crossAx val="4294967295"/>');
  const converted = chartXml(convertChartType(new TextEncoder().encode(xml), { type: 'scatterChart' }));
  for (const axis of converted.children(converted.plotArea).filter(node => kinds.has(node.localName))) {
    const id = Number(converted.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value);
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThanOrEqual(4294967295);
  }
});

test('removing a primary plot axis retains the crossing dependency of its peer', () => {
  const xml = new TextDecoder().decode(createOoxmlChart({ ...base, type: 'lineChart' }));
  const second = xml.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)![0].replace('<c:axId val="2"/>', '<c:axId val="3"/>');
  const secondaryAxis = xml.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)![0].replace('<c:axId val="2"/>', '<c:axId val="3"/>').replace('<c:axPos val="l"/>', '<c:axPos val="r"/>');
  const bytes = new TextEncoder().encode(xml.replace('</c:lineChart>', `</c:lineChart>${second}`).replace('</c:plotArea>', `${secondaryAxis}</c:plotArea>`));
  const source = chartXml(convertChartType(bytes, { type: 'pieChart' }, 0));
  const axes = source.children(source.plotArea).filter(axis => kinds.has(axis.localName));
  const ids = new Set(axes.map(axis => source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value));
  expect(ids).toEqual(new Set(['1', '2', '3']));
  for (const axis of axes) expect(ids.has(source.children(axis, 'crossAx')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value)).toBe(true);
});
