import { expect, test } from 'bun:test';
import { parseOoxmlChart, updateChartTitle } from '../src/index.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/chart' : 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  for (const title of ['', '<c:title/>', '<c:title><c:tx><c:strRef><c:f>Sheet1!A1</c:f></c:strRef></c:tx><c:overlay val="1"/></c:title>']) {
    test(`${conformance} chart title replacement retains chart data: ${title || 'absent'}`, () => {
      const plot = '<c:plotArea><c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:pt idx="0"><c:v>42</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart></c:plotArea>';
      const xml = `<c:chartSpace xmlns:c="${ns}"><c:chart>${title}<c:autoTitleDeleted val="1"/>${plot}</c:chart></c:chartSpace>`;
      const result = updateChartTitle(new TextEncoder().encode(xml), 'Growth & <targets>');
      expect(new TextDecoder().decode(result)).toContain(plot);
      expect(parseOoxmlChart(result, conformance)).toMatchObject({ title: 'Growth & <targets>' });
      expect(parseOoxmlChart(result, conformance).titleFormula).toBeUndefined();
    });
  }
}

test('rich title runs retain independent formatting through XML and scene layout', async () => {
  const { layoutChartScene } = await import('../src/index.ts');
  const ns = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const xml = new TextEncoder().encode(`<c:chartSpace xmlns:c="${ns}"><c:chart><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>`);
  const title = [{ alignment: 'center' as const, runs: [
    { text: 'Chart', style: { bold: true, fontSize: 18, underline: 'double' as const, highlight: '#FFFF00', color: { kind: 'rgb' as const, value: '#C00000' } } },
    { text: ' Title', style: { bold: false, italic: true, fontSize: 14 } },
  ] }];
  const model = parseOoxmlChart(updateChartTitle(xml, title), 'transitional');
  expect(model.titleText).toEqual(title);
  if (model.status !== 'supported') throw new Error('Expected chart');
  const scene = layoutChartScene(model, 576, 336);
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'text', text: 'Chart', font: expect.objectContaining({ weight: 700, size: 24, color: '#C00000' }) }));
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'text', text: ' Title', font: expect.objectContaining({ weight: 400, italic: true }) }));
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'rect', fill: '#FFFF00' }));
});
