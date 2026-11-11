import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, type ChartMark } from '../src/index.ts';
const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flat(mark.marks) : [mark]);
function model(type: 'barChart' | 'pieChart' | 'bubbleChart', labels: string, seriesLabels = '') {
  const source = new TextDecoder().decode(createOoxmlChart({ type, categories: ['North', 'South'], series: [{ name: 'Sales', values: [2, 6], xValues: [1, 2], bubbleSizes: [4, 8] }] }));
  const parsed = parseOoxmlChart(new TextEncoder().encode(source.replace(type === 'bubbleChart' ? '<c:xVal>' : '<c:cat>', seriesLabels + (type === 'bubbleChart' ? '<c:xVal>' : '<c:cat>')).replace('</c:ser>', `</c:ser>${labels}`)), 'transitional');
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

test('inside-end labels move into positive and negative columns while outside-end labels move away', () => {
  const original = model('barChart', '<c:dLbls><c:showVal val="1"/></c:dLbls>');
  const values = { ...original.series[0]!.values!, points: [{ index: 0, value: 2 }, { index: 1, value: -2 }] };
  const chart = { ...original, dataLabels: { ...original.dataLabels, textStyle: { color: { kind: 'rgb' as const, value: '#FF00FF' } } }, series: [{ ...original.series[0]!, values }] };
  const labels = (position: string) => flat(layoutChartScene({ ...chart, dataLabels: { ...chart.dataLabels, position } }, 600, 400).marks).filter((mark): mark is Extract<ChartMark, { kind: 'text' }> => mark.kind === 'text' && (mark.text === '2' || mark.text === '-2') && mark.font.color === '#FF00FF');
  const inside = labels('inEnd'), outside = labels('outEnd');
  expect(inside.find(mark => mark.text === '2')!.y).toBeGreaterThan(outside.find(mark => mark.text === '2')!.y);
  expect(inside.find(mark => mark.text === '-2')!.y).toBeLessThan(outside.find(mark => mark.text === '-2')!.y);
});

test('standalone chart dates use their authored 1904 epoch without a host formatter', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Date', values: [0] }] })).replace('<c:chart>', '<c:date1904 val="1"/><c:chart>').replace('</c:ser>', '</c:ser><c:dLbls><c:numFmt formatCode="yyyy-mm-dd" sourceLinked="0"/><c:showVal val="1"/></c:dLbls>');
  const chart = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (chart.status !== 'supported') throw new Error(chart.reason);
  expect(chart.dateSystem).toBe('1904');
  expect(flat(layoutChartScene(chart, 600, 400).marks).some(mark => mark.kind === 'text' && mark.text === '1904-01-01')).toBe(true);
});

test('secondary pie labels preserve the whole-series denominator and painted slices', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'ofPieChart', categories: ['A', 'B', 'C', 'D'], series: [{ name: 'One', values: [30, 40, 10, 20] }] })).replace('</c:ser>', '</c:ser><c:dLbls><c:showPercent val="1"/></c:dLbls>');
  const chart = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (chart.status !== 'supported') throw new Error(chart.reason);
  const scene = flat(layoutChartScene(chart, 600, 400).marks);
  expect(scene.filter(mark => mark.kind === 'path' && mark.fill && mark.fill !== 'none')).toHaveLength(5);
  const labels = scene.flatMap(mark => mark.kind === 'text' ? [mark.text] : []);
  expect(labels).toContain('10%');
  expect(labels).toContain('20%');
  expect(labels).not.toContain('67%');
});
