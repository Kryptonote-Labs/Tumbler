import { expect, test } from 'bun:test';
import { chartPropertyTree, createOoxmlChart, convertChartConformance, editChartSeries, editChartGradientFill, editChartSource, mergeChartFillDraft, readChartFill, readChartGradientFill, setChartSolidFill, updateChartTitle, type ChartPropertyNode } from '../src/index.ts';
const find = (node: ChartPropertyNode, name: string): ChartPropertyNode | undefined => node.name.split(':').at(-1) === name ? node : node.children.map(child => find(child, name)).find(Boolean);
const series = (bytes: Uint8Array) => find(chartPropertyTree(bytes), 'ser')!.id;
const source = () => createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });

test('gradient drafts preserve concurrent title and unrelated owner edits after source ids shift', () => {
  const base = source(), node = series(base), draft = editChartGradientFill(base, node, { kind: 'settings', angle: 35 });
  let current = updateChartTitle(base, 'Changed concurrently');
  current = editChartSource(current, [{ kind: 'attribute', node: series(current), name: 'custom', value: 'kept' }]);
  expect(series(current)).not.toBe(node);
  const merged = mergeChartFillDraft({ bytes: current, node: series(current) }, { bytes: base, node }, { bytes: draft, node });
  expect(new TextDecoder().decode(merged)).toContain('Changed concurrently');
  expect(new TextDecoder().decode(merged)).toContain('custom="kept"');
  expect(readChartGradientFill(merged, series(merged))!.angle).toBe(35);
});

test('changing an existing gradient rebases without overwriting concurrent line formatting', () => {
  let base = source(); base = editChartGradientFill(base, series(base), { kind: 'settings' });
  const before = readChartGradientFill(base, series(base))!, draft = editChartGradientFill(base, series(base), { kind: 'stop', node: before.stops[0]!.node, position: .25 });
  const line = find(chartPropertyTree(base), 'ln')!;
  const current = editChartSource(base, [{ kind: 'attribute', node: line.id, name: 'w', value: '76200' }]);
  const merged = mergeChartFillDraft({ bytes: current, node: series(current) }, { bytes: base, node: series(base) }, { bytes: draft, node: series(draft) });
  expect(find(chartPropertyTree(merged), 'ln')!.attributes.find(attribute => attribute.name === 'w')?.value).toBe('76200');
  expect(readChartGradientFill(merged, series(merged))!.stops[0]!.position).toBe(.25);
});

test('conflicting changes to the same fill reject without mutating either source', () => {
  const base = source(), node = series(base), draft = editChartGradientFill(base, node, { kind: 'settings' });
  const current = setChartSolidFill(base, node, { color: { kind: 'scheme', value: 'accent4' } }), saved = current.slice();
  expect(() => mergeChartFillDraft({ bytes: current, node }, { bytes: base, node }, { bytes: draft, node })).toThrow('This fill changed');
  expect(current).toEqual(saved);
  expect(readChartFill(current, node).foreground.value).toBe('accent4');
});


test('inherited-prefix gradient drafts adopt a concurrently changed strict namespace profile', () => {
  const base = new TextEncoder().encode(new TextDecoder().decode(source()).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, '<c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="accent1"/></a:gs><a:gs pos="100000"><a:schemeClr val="accent2"/></a:gs></a:gsLst><a:lin ang="1200000"/></a:gradFill></c:spPr>'));
  const draft = editChartGradientFill(base, series(base), { kind: 'settings', angle: 40 }), current = convertChartConformance(base, 'strict');
  const merged = mergeChartFillDraft({ bytes: current, node: series(current) }, { bytes: base, node: series(base) }, { bytes: draft, node: series(draft) });
  expect(readChartGradientFill(merged, series(merged))!.angle).toBe(40);
  expect(readChartGradientFill(merged, series(merged))!.stops).toHaveLength(2);
  expect(new TextDecoder().decode(merged)).not.toContain('http://schemas.openxmlformats.org/drawingml/2006/');
});

test('a draft cannot be applied to a different native series after a reorder', () => {
  const base = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'One', values: [2] }, { name: 'Two', values: [3] }] });
  const draft = editChartGradientFill(base, series(base), { kind: 'settings', angle: 35 });
  const current = editChartSeries(base, { action: 'move', series: 1, to: 0 });
  expect(() => mergeChartFillDraft({ bytes: current, node: series(current) }, { bytes: base, node: series(base) }, { bytes: draft, node: series(draft) })).toThrow('target changed');
  const target = find(chartPropertyTree(current), 'barChart')?.children.find(node => node.name === 'c:ser' && node.children.find(child => child.name === 'c:idx')?.attributes.find(attribute => attribute.name === 'val')?.value === '0');
  if (!target) throw Error('Expected original series');
  const merged = mergeChartFillDraft({ bytes: current, node: target.id }, { bytes: base, node: series(base) }, { bytes: draft, node: series(draft) });
  expect(readChartGradientFill(merged, target.id)!.angle).toBe(35);
});
