import { expect, test } from 'bun:test';
import { chartPropertyTree, createOoxmlChart, insertChartProperty, type ChartPropertyNode } from '../src/index.ts';
function find(node: ChartPropertyNode, label: string): ChartPropertyNode | undefined { return node.label === label ? node : node.children.map(child => find(child, label)).find(Boolean); }

test('property metadata exposes defaults, bounded numeric controls and enum choices', () => {
  const bytes = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'One', values: [3] }] });
  const root = chartPropertyTree(bytes);
  const bar = find(root, 'Bar Chart')!;
  expect(bar).toBeDefined();
  const direction = find(bar, 'Bar Direction')!;
  expect(direction.attributes[0]?.choices?.map(choice => choice.value)).toEqual(['bar', 'col']);
  const gap = bar.availableChildren.find(child => child.label === 'Gap Width')!;
  expect(gap).toBeDefined();
  const updated = chartPropertyTree(insertChartProperty(bytes, bar.id, gap.definition));
  const gapNode = find(updated, 'Gap Width')!;
  expect(gapNode.attributes[0]).toMatchObject({ minimum: 0, maximum: 500 });
  const order = find(updated, 'Bar Chart')!.children.map(child => child.label);
  expect(order.indexOf('Gap Width')).toBeLessThan(order.indexOf('Axis Id'));
});

test('adding a choice property replaces its peer and retains other axis properties', () => {
  const bytes = createOoxmlChart({ type: 'lineChart', categories: ['A'], series: [{ name: 'One', values: [3] }] });
  const root = chartPropertyTree(bytes);
  const axis = find(root, 'Value Axis')!;
  const crossesAt = axis.availableChildren.find(child => child.label === 'Crosses At')!;
  const updated = find(chartPropertyTree(insertChartProperty(bytes, axis.id, crossesAt.definition)), 'Value Axis')!;
  expect(updated.children.some(child => child.label === 'Crosses')).toBe(false);
  expect(updated.children.some(child => child.label === 'Crosses At')).toBe(true);
  expect(updated.children.some(child => child.label === 'Scaling')).toBe(true);
});

test('required rich text properties receive their required descendants in Strict namespaces', () => {
  const bytes = createOoxmlChart({ type: 'pieChart', conformance: 'strict', categories: ['A'], series: [{ name: 'One', values: [3] }] });
  const root = chartPropertyTree(bytes);
  const chart = find(root, 'Chart')!;
  const title = chart.availableChildren.find(child => child.label === 'Title')!;
  const updated = chartPropertyTree(insertChartProperty(bytes, chart.id, title.definition));
  expect(find(updated, 'Title')?.namespace).toBe('http://purl.oclc.org/ooxml/drawingml/chart');
  const originalValue = find(updated, 'Numeric Value');
  expect(originalValue?.editableText).toBe(true);
});
