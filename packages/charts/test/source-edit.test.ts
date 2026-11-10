import { expect, test } from 'bun:test';
import { editChartSource, inspectChartSource, type ChartSourceNode } from '../src/index.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function find(node: ChartSourceNode, name: string): ChartSourceNode {
  if (node.name === name) return node;
  for (const child of node.children) {
    try { return find(child, name); } catch { /* Try the next branch. */ }
  }
  throw new Error(`Missing ${name}`);
}
for (const namespace of [
  'http://schemas.openxmlformats.org/drawingml/2006/chart',
  'http://purl.oclc.org/ooxml/drawingml/chart',
  'http://schemas.microsoft.com/office/drawing/2014/chartex',
]) {
  test(`property edits preserve opaque content and namespace ${namespace}`, () => {
    const opaque = '<!--keep--><x:future xmlns:x="urn:future" flag=\'yes\'><x:value> untouched </x:value></x:future>';
    const bytes = encoder.encode(`<q:chartSpace xmlns:q="${namespace}"><q:chart>${opaque}<q:title><q:v>Old</q:v></q:title><q:legend visible="1"/></q:chart></q:chartSpace>`);
    const source = inspectChartSource(bytes);
    const changed = editChartSource(bytes, [
      { kind: 'attribute', node: find(source, 'q:legend').id, name: 'visible', value: '0' },
      { kind: 'text', node: find(source, 'q:v').id, value: '<New & title>' },
    ]);
    expect(decoder.decode(changed)).toContain(opaque);
    expect(find(inspectChartSource(changed), 'q:v').text).toBe('<New & title>');
    expect(decoder.decode(changed)).toContain('visible="0"');
    expect(editChartSource(bytes, [])).toEqual(bytes);
  });
}

test('supports insertion into empty elements, removal and advanced markup', () => {
  let bytes: Uint8Array = encoder.encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart/></c:chartSpace>');
  bytes = editChartSource(bytes, [{ kind: 'append', node: find(inspectChartSource(bytes), 'c:chart').id, markup: '<c:legend><c:overlay val="0"/></c:legend>' }]);
  bytes = editChartSource(bytes, [{ kind: 'before', node: find(inspectChartSource(bytes), 'c:legend').id, markup: '<c:plotArea/>' }]);
  bytes = editChartSource(bytes, [{ kind: 'remove', node: find(inspectChartSource(bytes), 'c:legend').id }]);
  expect(decoder.decode(bytes)).toContain('<c:chart><c:plotArea/></c:chart>');
});

test('rejects malformed, stale, overlapping or destructive leaf edits atomically', () => {
  const bytes = encoder.encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea/></c:chart></c:chartSpace>');
  const root = inspectChartSource(bytes);
  const chart = find(root, 'c:chart').id;
  expect(() => editChartSource(bytes, [{ kind: 'text', node: chart, value: 'erase' }])).toThrow('leaf');
  expect(() => editChartSource(bytes, [{ kind: 'append', node: chart, markup: '<bad:node/>' }])).toThrow();
  expect(() => editChartSource(bytes, [{ kind: 'attribute', node: chart, name: 'x="oops', value: 'x' }])).toThrow();
  expect(() => editChartSource(bytes, [{ kind: 'remove', node: 99999 }])).toThrow('missing');
  expect(() => editChartSource(bytes, [{ kind: 'remove', node: chart }, { kind: 'remove', node: find(root, 'c:plotArea').id }])).toThrow('conflict');
  expect(() => editChartSource(bytes, [{ kind: 'replace', node: root.id, markup: '<other/>' }])).toThrow('chartSpace');
  expect(() => editChartSource(bytes, [1, 2].map(() => ({ kind: 'attribute', node: chart, name: 'value', value: '1' })))).toThrow('Duplicate');
});
