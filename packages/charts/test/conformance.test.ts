import { expect, test } from 'bun:test';
import { convertChartConformance, createOoxmlChart, parseOoxmlChart } from '../src/index.ts';

test('conformance conversion changes standard declarations while preserving literal text and extension namespaces', () => {
  const literal = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const source = createOoxmlChart({ type: 'lineChart', title: literal, categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const custom = new TextEncoder().encode(new TextDecoder().decode(source).replace('</c:chartSpace>', '<c:extLst><c:ext uri="preserve"><t:source xmlns:t="urn:test"/></c:ext></c:extLst></c:chartSpace>'));
  const strict = convertChartConformance(custom, 'strict');
  expect(parseOoxmlChart(strict, 'strict')).toMatchObject({ status: 'supported', title: literal });
  expect(new TextDecoder().decode(strict)).toContain('xmlns:t="urn:test"');
  expect(convertChartConformance(strict, 'transitional')).toEqual(custom);
});
