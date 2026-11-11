import { chartPropertyTree, insertChartProperty, type ChartPropertyNode } from './properties.ts';
export const chartPropertyLocalName = (node: ChartPropertyNode) => node.name.split(':').at(-1);
export function chartPropertyPath(node: ChartPropertyNode, id: number): readonly number[] | undefined {
  if (node.id === id) return [];
  for (const [index, child] of node.children.entries()) {
    const path = chartPropertyPath(child, id);
    if (path) return [index, ...path];
  }
  return undefined;
}
export function chartPropertyAt(root: ChartPropertyNode, path: readonly number[]) { return path.reduce((node, index) => node.children[index]!, root); }
export function canSetChartFill(node: ChartPropertyNode, kind: 'blipFill' | 'pattFill'): boolean {
  const shape = chartPropertyLocalName(node) === 'spPr' ? node : node.children.find(child => chartPropertyLocalName(child) === 'spPr');
  return shape ? shape.children.some(child => chartPropertyLocalName(child) === kind) || shape.availableChildren.some(child => child.definition.endsWith(`/a:${kind}`)) : node.availableChildren.some(child => child.definition.endsWith('/c:spPr'));
}
/** Resolve a snapshot target before schema insertion shifts node ids. */
export function prepareChartFill(input: Uint8Array, nodeId: number, kind: 'blipFill' | 'pattFill') {
  let source = input, tree = chartPropertyTree(source);
  const path = chartPropertyPath(tree, nodeId);
  if (!path) throw new RangeError('The chart fill target changed. Read the chart again.');
  let owner = chartPropertyAt(tree, path);
  if (!canSetChartFill(owner, kind)) throw new TypeError('This chart property has no fill.');
  let shapePath = path;
  if (chartPropertyLocalName(owner) !== 'spPr') {
    let index = owner.children.findIndex(child => chartPropertyLocalName(child) === 'spPr');
    if (index < 0) {
      const definition = owner.availableChildren.find(child => child.definition.endsWith('/c:spPr'))!;
      source = insertChartProperty(source, owner.id, definition.definition);
      tree = chartPropertyTree(source); owner = chartPropertyAt(tree, path);
      index = owner.children.findIndex(child => chartPropertyLocalName(child) === 'spPr');
    }
    shapePath = [...path, index];
  }
  return { source, tree, shapePath, shape: chartPropertyAt(tree, shapePath) };
}
