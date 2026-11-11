import { isDrawingPatternPreset, type DrawingPatternPreset } from '@tumblerjs/ooxml';
import { chartPropertyTree, insertChartProperty, type ChartPropertyNode } from './properties.ts';
import { chartPropertyLocalName as local, chartPropertyPath, chartPropertyAt as at, canSetChartFill, prepareChartFill } from './fill-target.ts';
import { parseChartFill, parseChartPattern } from './formatting-parser.ts';
import { chartColorMarkup } from './chart-color-markup.ts';
import { chartXml } from './source-xml.ts';
import { editChartSource, type ChartSourceEdit } from './source-edit.ts';
import type { ChartColor } from './model.ts';
const kinds = { solidFill: 'solid', gradFill: 'gradient', blipFill: 'picture', pattFill: 'pattern', noFill: 'none', grpFill: 'group' } as const;
function fillNode(shape: ChartPropertyNode | undefined) { return shape?.children.find(child => Object.hasOwn(kinds, local(child) ?? '')); }
function shapeNode(node: ChartPropertyNode) { return local(node) === 'spPr' ? node : node.children.find(child => local(child) === 'spPr'); }
const scheme = (value: string): ChartColor => ({ kind: 'scheme', value });

/** Inspect one fill without modifying its theme colours or inherited formatting. */
export function readChartFill(bytes: Uint8Array, nodeId: number) {
  const tree = chartPropertyTree(bytes), path = chartPropertyPath(tree, nodeId);
  if (!path) throw new RangeError('The chart fill target changed. Read the chart again.');
  const node = at(tree, path), shape = shapeNode(node), fill = fillNode(shape), source = chartXml(bytes), drawing = source.namespace.replace(/chart$/, 'main');
  const element = shape && source.document.element(shape.id), solid = parseChartFill(element, drawing), pattern = parseChartPattern(element, drawing);
  const ancestors = [tree, ...path.map((_, index) => at(tree, path.slice(0, index + 1)))];
  const series = ancestors.find(ancestor => local(ancestor) === 'ser'), parent = series && ancestors[ancestors.indexOf(series) - 1];
  const ordered = parent?.children.filter(child => local(child) === 'ser').toSorted((a, b) => Number(a.children.find(child => local(child) === 'order')?.attributes.find(attribute => attribute.name === 'val')?.value ?? 0) - Number(b.children.find(child => local(child) === 'order')?.attributes.find(attribute => attribute.name === 'val')?.value ?? 0));
  const inherited = series && shapeNode(series), inheritedSolid = inherited && parseChartFill(source.document.element(inherited.id), drawing);
  const automatic = series ? inheritedSolid ?? scheme(`accent${Math.max(0, ordered?.indexOf(series) ?? 0) % 6 + 1}`) : scheme('tx1');
  const foreground = pattern ? pattern.foreground ?? { kind: 'rgb' as const, value: '#000000' } : solid ?? automatic;
  const background = pattern ? pattern.background ?? { kind: 'rgb' as const, value: '#FFFFFF' } : scheme('bg1');
  const kind = Object.entries(kinds).find(([name]) => name === (fill && local(fill)))?.[1] ?? 'automatic';
  const ownerIdentity = [local(node), ...ancestors.flatMap(ancestor => {
    const identity = ancestor.children.find(child => child.namespace === source.namespace && ['idx', 'axId'].includes(local(child) ?? ''));
    const value = identity?.attributes.find(attribute => attribute.name === 'val')?.value;
    return value === undefined ? [] : [`${local(ancestor)}:${value}`];
  })].join('/');
  return { kind, fill, pattern, foreground, background, ownerIdentity, solidSeed: solid ?? pattern?.foreground ?? (series ? automatic : scheme('bg1')), capable: canSetChartFill(node, 'pattFill') };
}

/** Replace the fill choice while preserving existing pattern colours, transforms and unknown properties. */
export function setChartPatternFill(bytes: Uint8Array, nodeId: number, options: { readonly preset: DrawingPatternPreset; readonly foreground?: ChartColor | undefined; readonly background?: ChartColor | undefined }): Uint8Array {
  if (!isDrawingPatternPreset(options.preset)) throw new TypeError('Unknown chart pattern preset.');
  const previous = readChartFill(bytes, nodeId);
  if (previous.pattern?.preset === options.preset && options.foreground === undefined && options.background === undefined) return bytes;
  let { source, tree, shapePath, shape } = prepareChartFill(bytes, nodeId, 'pattFill');
  let fill = shape.children.find(child => local(child) === 'pattFill');
  if (!fill) {
    const definition = shape.availableChildren.find(child => child.definition.endsWith('/a:pattFill'));
    if (!definition) throw new TypeError('This chart property has no pattern fill.');
    source = insertChartProperty(source, shape.id, definition.definition);
    tree = chartPropertyTree(source); shape = at(tree, shapePath); fill = shape.children.find(child => local(child) === 'pattFill')!;
  }
  if (chartXml(source).document.element(fill.id)?.selfClosing) {
    source = editChartSource(source, [{ kind: 'append', node: fill.id, markup: '' }]);
    tree = chartPropertyTree(source); shape = at(tree, shapePath); fill = shape.children.find(child => local(child) === 'pattFill')!;
  }
  const drawing = chartXml(source).namespace.replace(/chart$/, 'main');
  const edits: ChartSourceEdit[] = [{ kind: 'attribute', node: fill.id, name: 'prst', value: options.preset }];
  const append: string[] = [];
  for (const [name, value] of [['fgClr', options.foreground ?? (previous.pattern ? undefined : previous.foreground)], ['bgClr', options.background ?? (previous.pattern ? undefined : previous.background)]] as const) {
    if (!value) continue;
    const container = fill.children.find(child => local(child) === name), markup = chartColorMarkup(value, drawing);
    const color = container?.children.find(child => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(local(child) ?? ''));
    if (color) edits.push({ kind: 'replace', node: color.id, markup });
    else if (container) edits.push({ kind: 'append', node: container.id, markup });
    else {
      const xml = `<a:${name} xmlns:a="${drawing}">${markup}</a:${name}>`;
      const following = name === 'fgClr' ? fill.children.find(child => local(child) === 'bgClr') : undefined;
      if (following) edits.push({ kind: 'before', node: following.id, markup: xml }); else append.push(xml);
    }
  }
  if (append.length) edits.push({ kind: 'append', node: fill.id, markup: append.join('') });
  return editChartSource(source, edits);
}

/** Clearing an explicit fill restores inheritance; noFill remains a distinct source choice. */
export function clearChartFill(bytes: Uint8Array, nodeId: number): Uint8Array {
  const fill = readChartFill(bytes, nodeId).fill;
  return fill ? editChartSource(bytes, [{ kind: 'remove', node: fill.id }]) : bytes;
}

/** Author an explicit no-fill while retaining the rest of the shape properties. */
export function setChartNoFill(bytes: Uint8Array, nodeId: number): Uint8Array {
  if (readChartFill(bytes, nodeId).kind === 'none') return bytes;
  const { source, shape } = prepareChartFill(bytes, nodeId, 'pattFill');
  const definition = shape.availableChildren.find(child => child.definition.endsWith('/a:noFill'));
  if (!definition) throw new TypeError('This chart property has no fill choice.');
  return insertChartProperty(source, shape.id, definition.definition);
}
