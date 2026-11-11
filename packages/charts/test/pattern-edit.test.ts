import { expect, test } from 'bun:test';
import { clearChartFill, chartPropertyTree, createOoxmlChart, readChartFill, setChartPatternFill, type ChartPropertyNode } from '../src/index.ts';
function series(root: ChartPropertyNode): ChartPropertyNode {
  const found = root.children.find(child => child.name.endsWith(':ser'));
  if (found) return found;
  for (const child of root.children) { try { return series(child); } catch {} }
  throw Error('Series missing.');
}
const source = () => createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] });
test('pattern selection replaces the fill choice and retains source colours and adjacent line properties', () => {
  const initial = source(), target = series(chartPropertyTree(initial));
  const next = setChartPatternFill(initial, target.id, { preset: 'diagBrick' });
  const state = readChartFill(next, series(chartPropertyTree(next)).id);
  expect(state).toMatchObject({ kind: 'pattern', pattern: { preset: 'diagBrick', foreground: { kind: 'scheme', value: 'accent1' }, background: { kind: 'scheme', value: 'bg1' } } });
  const xml = new TextDecoder().decode(next);
  expect(xml).toContain('<a:ln>');
  expect(state.fill?.children.map(child => child.name.split(':').at(-1))).toEqual(['fgClr', 'bgClr']);
  expect(setChartPatternFill(next, series(chartPropertyTree(next)).id, { preset: 'diagBrick' })).toBe(next);
});
test('preset changes preserve colour transforms, unknown attributes and target-snapshot addressing', () => {
  const xml = new TextDecoder().decode(source()).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:pattFill xmlns:u="urn:test" u:keep="yes" prst="pct5"><a:fgClr><a:schemeClr val="accent2"><a:lumMod val="60000"/><a:alpha val="50000"/></a:schemeClr></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill><a:ln w="25400"/></c:spPr>');
  const before = new TextEncoder().encode(xml), target = series(chartPropertyTree(before));
  const next = setChartPatternFill(before, target.id, { preset: 'wave' });
  expect(new TextDecoder().decode(next)).toBe(xml.replace('prst="pct5"', 'prst="wave"'));
  const changed = setChartPatternFill(next, series(chartPropertyTree(next)).id, { preset: 'wave', foreground: { kind: 'rgb', value: '#00FF00' } });
  expect(new TextDecoder().decode(changed)).toContain('u:keep="yes"');
  expect(new TextDecoder().decode(changed)).not.toContain('lumMod');
  expect(new TextDecoder().decode(changed)).toContain('val="00FF00"');
});
test('pattern creation handles absent shape properties and self-closing pattern sources atomically', () => {
  for (const initial of [new TextDecoder().decode(source()).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/g, ''), new TextDecoder().decode(source()).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:pattFill prst="pct5"/></c:spPr>')]) {
    const bytes = new TextEncoder().encode(initial);
    const next = setChartPatternFill(bytes, series(chartPropertyTree(bytes)).id, { preset: 'weave', foreground: { kind: 'scheme', value: 'accent3' }, background: { kind: 'scheme', value: 'bg1' } });
    const target = series(chartPropertyTree(next));
    expect(readChartFill(next, target.id)).toMatchObject({ kind: 'pattern', pattern: { preset: 'weave', foreground: { value: 'accent3' }, background: { value: 'bg1' } } });
    const cleared = clearChartFill(next, target.id);
    expect(readChartFill(cleared, series(chartPropertyTree(cleared)).id).kind).toBe('automatic');
  }
});
