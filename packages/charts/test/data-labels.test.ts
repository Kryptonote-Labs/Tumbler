import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartMark } from '../src/index.ts';
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
function model(type: 'barChart' | 'pieChart' | 'bubbleChart', labels: string, seriesLabels = '') {
  const source = new TextDecoder().decode(createOoxmlChart({ type, categories: ['North', 'South'], series: [{ name: 'Sales', values: [2, 6], xValues: [1, 2], bubbleSizes: [4, 8] }] }));
  const parsed = parseOoxmlChart(new TextEncoder().encode(source.replace('</c:ser>', `${seriesLabels}</c:ser>`).replace(`</c:${type}>`, `${labels}</c:${type}>`)), 'transitional');
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return parsed;
}

test('labels combine series/category names and formatted values with authored separators', () => {
  const chart = model('barChart', '<c:dLbls><c:numFmt formatCode="0.00" sourceLinked="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:showSerName val="1"/><c:separator> / </c:separator></c:dLbls>');
  const texts = flat(layoutChartScene(chart, 600, 400).marks).flatMap(mark => mark.kind === 'text' ? [mark.text] : []);
  expect(texts).toContain('Sales / North / 2.00');
  expect(texts).toContain('Sales / South / 6.00');
});

test('pie percent labels use the whole series and point deletion suppresses one label', () => {
  const chart = model('pieChart', '<c:dLbls><c:dLbl><c:idx val="1"/><c:delete val="1"/></c:dLbl><c:showPercent val="1"/></c:dLbls>');
  const texts = flat(layoutChartScene(chart, 600, 400).marks).flatMap(mark => mark.kind === 'text' ? [mark.text] : []);
  expect(texts).toContain('25%');
  expect(texts).not.toContain('75%');
});

test('bubble labels read the size cache and a custom point label overrides generated text', () => {
  const chart = model('bubbleChart', '<c:dLbls><c:showBubbleSize val="1"/></c:dLbls>', '<c:dLbls><c:dLbl><c:idx val="0"/><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Custom</a:t></a:r></a:p></c:rich></c:tx></c:dLbl></c:dLbls>');
  const texts = flat(layoutChartScene(chart, 600, 400).marks).flatMap(mark => mark.kind === 'text' ? [mark.text] : []);
  expect(texts).toContain('Custom');
  expect(texts).toContain('8');
});
