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
