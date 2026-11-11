import { expect, test } from 'bun:test';
import { createOoxmlChart, readChartData, updateChartData, parseOoxmlChart } from '../src/index.ts';

for (const type of ['barChart', 'scatterChart', 'bubbleChart', 'areaChart', 'radarChart', 'surface3DChart'] as const) {
  test(`${type} data edits retain series appearance and source values`, () => {
    const source = createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: [{ name: 'Revenue', values: [1, null, 3], bubbleSizes: [4, 5, 6] }] });
    const data = readChartData(source);
    expect(data[0]?.series[0]?.values?.values[0]).toBe(1);
    expect(data[0]?.series[0]?.values?.values[1]).toBeUndefined();
    expect(data[0]?.series[0]?.values?.values[2]).toBe(3);
    const changed = updateChartData(source, data.map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, name: 'Growth', values: { ...series.values!, values: [2, 5, 8] } })) })));
    expect(readChartData(changed)[0]?.series[0]?.values?.values).toEqual([2, 5, 8]);
    expect(new TextDecoder().decode(changed)).toContain('<a:schemeClr val="accent1"/>');
    expect(parseOoxmlChart(changed, 'transitional').status).toBe('supported');
  });
}

test('formula-backed cached data retains the reference, numeric format and category hierarchy', () => {
  const source = new TextEncoder().encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:lineChart><c:grouping val="standard"/><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:multiLvlStrRef><c:f>Sheet1!A1:B2</c:f><c:multiLvlStrCache><c:ptCount val="2"/><c:lvl><c:pt idx="0"><c:v>Jan</c:v></c:pt><c:pt idx="1"><c:v>Feb</c:v></c:pt></c:lvl><c:lvl><c:pt idx="0"><c:v>2026</c:v></c:pt></c:lvl></c:multiLvlStrCache></c:multiLvlStrRef></c:cat><c:val><c:numRef><c:f>Sheet1!C1:C2</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:lineChart></c:plotArea></c:chart></c:chartSpace>');
  const data = readChartData(source);
  const result = updateChartData(source, data.map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, values: { ...series.values!, values: [3, 4] } })) })));
  const updated = readChartData(result)[0]!.series[0]!;
  expect(updated.values).toMatchObject({ values: [3, 4], formula: 'Sheet1!C1:C2', formatCode: '0.00' });
  expect(updated.categories?.levels).toEqual(data[0]?.series[0]?.categories?.levels);
});

test('changing a referenced series title retains cache and reference extension metadata', () => {
  const original = createOoxmlChart({ type: 'lineChart', categories: ['A'], series: [{ name: 'Old', values: [1] }] });
  const metadata = '<c:extLst><c:ext uri="cache"><x:keep xmlns:x="urn:test"/></c:ext></c:extLst>';
  const referenceMetadata = '<c:extLst><c:ext uri="reference"><x:keep xmlns:x="urn:test"/></c:ext></c:extLst>';
  const source = new TextEncoder().encode(new TextDecoder().decode(original).replace('<c:tx><c:v>Old</c:v></c:tx>', `<c:tx><c:strRef><c:f>Sheet1!B1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Old</c:v></c:pt>${metadata}</c:strCache>${referenceMetadata}</c:strRef></c:tx>`));
  const updated = updateChartData(source, readChartData(source).map(plot => ({ ...plot, series: plot.series.map(series => ({ ...series, name: 'New' })) })));
  expect(new TextDecoder().decode(updated)).toContain(metadata);
  expect(new TextDecoder().decode(updated)).toContain(referenceMetadata);
  expect(readChartData(updated)[0]?.series[0]?.name).toBe('New');
});
