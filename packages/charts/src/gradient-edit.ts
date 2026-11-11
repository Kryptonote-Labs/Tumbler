import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { chartColorMarkup, chartColorOpacity, chartColorOpacityMarkup } from './chart-color-markup.ts';
import { ensureChartFillNode } from './fill-target.ts';
import { parseChartColorContainer } from './formatting-parser.ts';
import { readChartFill } from './pattern-edit.ts';
import { editChartSource, type ChartSourceEdit } from './source-edit.ts';
import { chartXml } from './source-xml.ts';
import type { ChartColor } from './model.ts';

const child = (element: LosslessXmlElement, ns: string, name: string) => element.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);
const attr = (element: LosslessXmlElement | undefined, name: string) => element?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name)?.value;
const ratio = (value: string | undefined) => value?.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value ?? 0) / 100000;
function percentage(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Gradient positions must be between 0 and 1.');
  return String(Math.round(value * 100000));
}
export type ChartGradientType = 'linear' | 'circle' | 'rect' | 'shape';
export type ChartGradientEdit =
  | { readonly kind: 'settings'; readonly type?: ChartGradientType | undefined; readonly angle?: number | undefined }
  | { readonly kind: 'stop'; readonly node: number; readonly position?: number | undefined; readonly color?: ChartColor | undefined; readonly opacity?: number | undefined }
  | { readonly kind: 'add'; readonly position: number; readonly color: ChartColor; readonly opacity?: number | undefined }
  | { readonly kind: 'remove'; readonly node: number };

/** Stops retain their source addresses and order, including coincident or unsupported colour choices. */
export function readChartGradientFill(bytes: Uint8Array, nodeId: number) {
  const previous = readChartFill(bytes, nodeId);
  if (previous.kind !== 'gradient' || !previous.fill) return;
  const source = chartXml(bytes), drawing = source.namespace.replace(/chart$/, 'main'), fill = source.document.element(previous.fill.id)!;
  const list = child(fill, drawing, 'gsLst'), linear = child(fill, drawing, 'lin'), path = child(fill, drawing, 'path');
  const stops = list?.children.flatMap(node => {
    if (node.kind !== 'element' || node.namespaceUri !== drawing || node.localName !== 'gs') return [];
    const color = parseChartColorContainer(node, drawing);
    return [{ node: node.id, position: ratio(attr(node, 'pos')), color, opacity: color ? chartColorOpacity(color) : 1 }];
  }) ?? [];
  const type: ChartGradientType = path ? attr(path, 'path') === 'circle' ? 'circle' : attr(path, 'path') === 'rect' ? 'rect' : 'shape' : 'linear';
  return { node: fill.id, type, angle: Number(attr(linear, 'ang') ?? 0) / 60000, stops };
}

/** Solid colour changes preserve existing opacity unless explicitly changed. */
export function setChartSolidFill(bytes: Uint8Array, nodeId: number, options: { readonly color?: ChartColor | undefined; readonly opacity?: number | undefined } = {}) {
  const previous = readChartFill(bytes, nodeId);
  if (previous.kind === 'solid' && !options.color && options.opacity === undefined) return bytes;
  const { source, fill } = ensureChartFillNode(bytes, nodeId, 'solidFill'), xml = chartXml(source), drawing = xml.namespace.replace(/chart$/, 'main');
  const element = xml.document.element(fill.id)!, color = options.color ?? (previous.kind === 'solid' ? { ...previous.solidSeed, source: element } : previous.solidSeed);
  const current = element.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === drawing && ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(node.localName));
  const opacity = options.opacity ?? (options.color && previous.kind === 'solid' ? chartColorOpacity(previous.foreground) : undefined);
  const markup = chartColorOpacityMarkup(color, drawing, opacity);
  return editChartSource(source, [{ kind: current ? 'replace' : 'append', node: current?.id ?? fill.id, markup }]);
}

/** Common gradient edits change targeted native nodes; advanced geometry and extensions survive. */
export function editChartGradientFill(bytes: Uint8Array, nodeId: number, edit: ChartGradientEdit): Uint8Array {
  const previous = readChartGradientFill(bytes, nodeId);
  if (!previous) {
    if (edit.kind !== 'settings') throw new TypeError('The chart target has no gradient.');
    const seed = readChartFill(bytes, nodeId).solidSeed, { source, fill } = ensureChartFillNode(bytes, nodeId, 'gradFill');
    const drawing = chartXml(source).namespace.replace(/chart$/, 'main');
    const angle = edit.angle ?? 90;
    if (!Number.isFinite(angle)) throw new RangeError('Gradient angle must be finite.');
    const shading = edit.type && edit.type !== 'linear' ? `<a:path path="${edit.type}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>` : `<a:lin ang="${(Math.round(((angle % 360 + 360) % 360) * 60000) % 21600000)}" scaled="0"/>`;
    return editChartSource(source, [{ kind: 'replace', node: fill.id, markup: `<a:gradFill xmlns:a="${drawing}"><a:gsLst><a:gs pos="0">${chartColorMarkup(seed, drawing)}</a:gs><a:gs pos="100000">${chartColorMarkup({ kind: 'scheme', value: 'bg1' }, drawing)}</a:gs></a:gsLst>${shading}</a:gradFill>` }]);
  }
  const source = chartXml(bytes), drawing = source.namespace.replace(/chart$/, 'main'), fill = source.document.element(previous.node)!;
  if (edit.kind === 'settings') {
    const linear = child(fill, drawing, 'lin'), path = child(fill, drawing, 'path'), type = edit.type ?? previous.type;
    const edits: ChartSourceEdit[] = [];
    if (edit.angle !== undefined && !Number.isFinite(edit.angle)) throw new RangeError('Gradient angle must be finite.');
    const angle = (Math.round(((((edit.angle ?? previous.angle) % 360) + 360) % 360) * 60000) % 21600000);
    if (type === 'linear' && linear) { if (edit.angle !== undefined) edits.push({ kind: 'attribute', node: linear.id, name: 'ang', value: String(angle) }); }
    else if (type !== 'linear' && path) { if (edit.type !== undefined) edits.push({ kind: 'attribute', node: path.id, name: 'path', value: type }); }
    else {
      const markup = type === 'linear' ? `<a:lin xmlns:a="${drawing}" ang="${angle}" scaled="0"/>` : `<a:path xmlns:a="${drawing}" path="${type}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>`;
      const current = linear ?? path, following = child(fill, drawing, 'tileRect');
      edits.push({ kind: current ? 'replace' : following ? 'before' : 'append', node: current?.id ?? following?.id ?? fill.id, markup });
    }
    return edits.length ? editChartSource(bytes, edits) : bytes;
  }
  const list = child(fill, drawing, 'gsLst');
  if (edit.kind === 'add') {
    const markup = `<a:gs xmlns:a="${drawing}" pos="${percentage(edit.position)}">${chartColorOpacityMarkup(edit.color, drawing, edit.opacity)}</a:gs>`;
    if (list) return editChartSource(bytes, [{ kind: 'append', node: list.id, markup }]);
    const following = child(fill, drawing, 'lin') ?? child(fill, drawing, 'path') ?? child(fill, drawing, 'tileRect');
    return editChartSource(bytes, [{ kind: following ? 'before' : 'append', node: following?.id ?? fill.id, markup: `<a:gsLst xmlns:a="${drawing}"><a:gs pos="0"><a:srgbClr val="000000"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs>${markup}</a:gsLst>` }]);
  }
  const stop = previous.stops.find(stop => stop.node === edit.node);
  if (!stop) throw new RangeError('The gradient stop changed. Read the chart again.');
  if (edit.kind === 'remove') {
    if (previous.stops.length <= 2) throw new RangeError('A gradient needs at least two stops.');
    return editChartSource(bytes, [{ kind: 'remove', node: stop.node }]);
  }
  const edits: ChartSourceEdit[] = [];
  if (edit.position !== undefined) edits.push({ kind: 'attribute', node: stop.node, name: 'pos', value: percentage(edit.position) });
  if (edit.color || edit.opacity !== undefined) {
    const color = edit.color ?? (stop.color && { ...stop.color, source: source.document.element(stop.node)! });
    if (!color) throw new TypeError('Choose a colour before editing this stop opacity.');
    const current = source.document.element(stop.node)!.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === drawing && ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(node.localName));
    edits.push({ kind: current ? 'replace' : 'append', node: current?.id ?? stop.node, markup: chartColorOpacityMarkup(color, drawing, edit.opacity ?? (edit.color ? stop.opacity : undefined)) });
  }
  return edits.length ? editChartSource(bytes, edits) : bytes;
}
