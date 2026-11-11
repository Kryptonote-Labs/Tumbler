import { expect, test } from 'bun:test';
import { createOoxmlChart, inspectChartSource, OOXML_CHART_TYPES, parseOoxmlChart } from '../src/index.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  for (const type of OOXML_CHART_TYPES) {
    test(`create ${conformance} ${type} with theme colours and sparse data`, () => {
      const bytes = createOoxmlChart({
        type, conformance, title: 'Revenue & growth', categories: ['A', 'B', 'C'],
        series: Array.from({ length: type === 'stockChart' ? 3 : 2 }, (_, i) => ({ name: `Series ${i}`, values: [i + 1, null, i + 3], bubbleSizes: [2, 3, 4] })),
      });
      expect(inspectChartSource(bytes).namespace).toContain(conformance === 'strict' ? 'purl.oclc.org' : 'schemas.openxmlformats.org');
      const xml = new TextDecoder().decode(bytes);
      expect(xml).toContain(`<c:${type}>`);
      expect(xml).toContain('<a:schemeClr val="accent1"/>');
      expect(xml).toContain('<c:ptCount val="3"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt>');
      expect(parseOoxmlChart(bytes, conformance).title).toBe('Revenue & growth');
    });
  }
}

test('reject invalid chart data without coercing or dropping it', () => {
  const options = { type: 'lineChart' as const, categories: ['A'], series: [{ name: 'X', values: [NaN] }] };
  expect(() => createOoxmlChart(options)).toThrow('finite');
  expect(() => createOoxmlChart({ ...options, series: [{ name: 'X', values: [] }] })).toThrow('counts');
  expect(() => createOoxmlChart({ ...options, type: 'stockChart' })).toThrow('three or four');
  expect(() => createOoxmlChart({ ...options, type: 'bubbleChart' })).toThrow('sizes');
  expect(() => createOoxmlChart({ ...options, grouping: 'clustered' })).toThrow('grouping');
});

for (const value of ['\ufffe', '\uffff', '\ud800', '\u0000']) {
  test('reject non-XML text before creating a chart part', () => {
    const options = { type: 'pieChart' as const, categories: [value], series: [{ name: 'A', values: [1] }] };
    expect(() => createOoxmlChart(options)).toThrow('XML text');
    expect(() => createOoxmlChart({ ...options, categories: ['A'], series: [{ name: value, values: [1] }] })).toThrow('XML text');
  });
}
