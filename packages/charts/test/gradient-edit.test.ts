import { expect, test } from 'bun:test';
import { chartPropertyTree, createOoxmlChart, editChartGradientFill, readChartGradientFill, setChartSolidFill, readChartFill, chartColorOpacity, resolveChartColor, type ChartPropertyNode } from '../src/index.ts';
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
function find(node: ChartPropertyNode, local: string): ChartPropertyNode | undefined { return node.name.split(':').at(-1) === local ? node : node.children.map(child => find(child, local)).find(Boolean); }
function fixture(fill?: string) {
  const bytes = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [3] }] });
  const source = fill ? new TextEncoder().encode(text(bytes).replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, `<c:spPr>${fill}</c:spPr>`)) : bytes;
  return { source, node: find(chartPropertyTree(source), 'ser')!.id };
}
const sourceGradient = '<a:gradFill rotWithShape="0" flip="xy"><a:gsLst><a:gs pos="100000"><a:schemeClr val="accent2"><a:satMod val="80000"/><a:alpha val="80000"/><a:alphaMod val="50000"/><a:lumOff val="10000"/></a:schemeClr></a:gs><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="0"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="25000" r="50000" t="10000" b="30000"/></a:path><a:tileRect r="50000"/></a:gradFill>';

test('new solid fills retain the template background or the inherited series accent', () => {
  const { source, node } = fixture();
  const solid = setChartSolidFill(source, node);
  expect(readChartFill(solid, find(chartPropertyTree(solid), 'ser')!.id).foreground).toEqual({ kind: 'scheme', value: 'accent1' });
  const space = setChartSolidFill(source, chartPropertyTree(source).id);
  expect(readChartFill(space, chartPropertyTree(space).id).foreground).toEqual({ kind: 'scheme', value: 'bg1' });
});

test('gradient stop edits address source order and preserve theme transforms and geometry', () => {
  const { source, node } = fixture(sourceGradient), before = readChartGradientFill(source, node)!;
  expect(before.stops.map(stop => stop.position)).toEqual([1, 0, 0]);
  expect(before.stops[0]!.opacity).toBeCloseTo(.4);
  const moved = editChartGradientFill(source, node, { kind: 'stop', node: before.stops[0]!.node, position: .75, opacity: .3 });
  const next = readChartGradientFill(moved, find(chartPropertyTree(moved), 'ser')!.id)!;
  expect(next.stops.map(stop => stop.position)).toEqual([.75, 0, 0]);
  expect(next.stops[0]!.color?.value).toBe('accent2');
  expect(next.stops[0]!.opacity).toBe(.3);
  expect(text(moved)).toMatch(/<a:satMod\b[^>]*\bval="80000"/);
  expect(text(moved)).toMatch(/<a:lumOff\b[^>]*\bval="10000"/);
  expect(text(moved)).not.toContain('alphaMod');
  expect(text(moved)).toContain('<a:tileRect r="50000"/>');
  expect(text(moved)).toContain('rotWithShape="0" flip="xy"');
  expect(text(moved)).toContain('<a:fillToRect l="25000" r="50000" t="10000" b="30000"/>');
});

test('changing stop colour keeps opacity and coincident stops remain separate', () => {
  const { source, node } = fixture(sourceGradient), before = readChartGradientFill(source, node)!;
  const changed = editChartGradientFill(source, node, { kind: 'stop', node: before.stops[0]!.node, color: { kind: 'scheme', value: 'accent4' } });
  const after = readChartGradientFill(changed, find(chartPropertyTree(changed), 'ser')!.id)!;
  expect(after.stops).toHaveLength(3);
  expect(after.stops[0]!.color?.value).toBe('accent4');
  expect(after.stops[0]!.opacity).toBe(.4);
  expect(after.stops.slice(1).map(stop => stop.color?.value)).toEqual(['#FF0000', '#0000FF']);
});

test('gradient type settings retain native focus and tile metadata', () => {
  const { source, node } = fixture(sourceGradient);
  const changed = editChartGradientFill(source, node, { kind: 'settings', type: 'rect' });
  expect(readChartGradientFill(changed, node)!.type).toBe('rect');
  expect(text(changed)).toContain('<a:fillToRect l="25000" r="50000" t="10000" b="30000"/>');
  expect(text(changed)).toContain('<a:tileRect r="50000"/>');
});

test('new gradient fills use theme colours and adding or removing stops preserves native data', () => {
  const { source, node } = fixture();
  let changed = editChartGradientFill(source, node, { kind: 'settings', angle: -45 });
  const owner = () => find(chartPropertyTree(changed), 'ser')!.id;
  expect(readChartGradientFill(changed, owner())!.angle).toBe(315);
  expect(readChartGradientFill(changed, owner())!.stops.map(stop => stop.color?.kind)).toEqual(['scheme', 'scheme']);
  changed = editChartGradientFill(changed, owner(), { kind: 'add', position: .5, color: { kind: 'scheme', value: 'accent3' }, opacity: .6 });
  const added = readChartGradientFill(changed, owner())!.stops.at(-1)!;
  expect(added.position).toBe(.5); expect(added.opacity).toBe(.6);
  changed = editChartGradientFill(changed, owner(), { kind: 'remove', node: added.node });
  const current = readChartGradientFill(changed, owner())!;
  expect(current.stops).toHaveLength(2);
  expect(() => editChartGradientFill(changed, owner(), { kind: 'remove', node: current.stops[0]!.node })).toThrow('at least two');
  expect(() => editChartGradientFill(changed, owner(), { kind: 'add', position: 1.1, color: { kind: 'rgb', value: '#000000' } })).toThrow('between 0 and 1');
});

test('solid colour edits retain source colour transforms when only opacity changes', () => {
  const { source, node } = fixture('<a:solidFill><a:schemeClr val="accent4"><a:shade val="60000"/><a:alpha val="70000"/></a:schemeClr></a:solidFill>');
  const changed = setChartSolidFill(source, node, { opacity: .2 });
  const fill = readChartFill(changed, node);
  expect(fill.foreground.value).toBe('accent4');
  expect(chartColorOpacity(fill.foreground)).toBe(.2);
  expect(text(changed)).toMatch(/<a:shade\b[^>]*\bval="60000"/);
});


test('opacity-only edits retain unknown attributes and foreign colour children', () => {
  const color = '<a:schemeClr xmlns:u="urn:colour-extension" val="accent2" u:keep="yes"><a:lumMod val="80000"/><u:property value="kept"/></a:schemeClr>';
  const solid = fixture(`<a:solidFill>${color}</a:solidFill>`);
  const changed = setChartSolidFill(solid.source, solid.node, { opacity: .2 });
  expect(text(changed)).toContain('u:keep="yes"'); expect(text(changed)).toContain('value="kept"');
  const gradient = fixture(`<a:gradFill><a:gsLst><a:gs pos="0">${color}</a:gs><a:gs pos="100000"><a:srgbClr val="000000"/></a:gs></a:gsLst><a:lin/></a:gradFill>`);
  const stop = readChartGradientFill(gradient.source, gradient.node)!.stops[0]!;
  const edited = editChartGradientFill(gradient.source, gradient.node, { kind: 'stop', node: stop.node, opacity: .3 });
  expect(text(edited)).toContain('u:keep="yes"'); expect(text(edited)).toContain('value="kept"');
});

test('gradient angles wrap after fixed-angle rounding at the full-turn boundary', () => {
  const { source, node } = fixture();
  const initialized = editChartGradientFill(source, node, { kind: 'settings', angle: -.0000001 });
  expect(readChartGradientFill(initialized, node)!.angle).toBe(0);
  const existing = editChartGradientFill(initialized, node, { kind: 'settings', angle: 359.9999999 });
  expect(readChartGradientFill(existing, node)!.angle).toBe(0);
});


test('colour changes retain opacity after each ordered alpha transform saturates', () => {
  const { source, node } = fixture('<a:solidFill><a:schemeClr val="accent2"><a:alphaOff val="50000"/><a:alphaMod val="50000"/></a:schemeClr></a:solidFill>');
  expect(chartColorOpacity(readChartFill(source, node).foreground)).toBe(.5);
  const changed = setChartSolidFill(source, node, { color: { kind: 'scheme', value: 'accent3' } });
  expect(chartColorOpacity(readChartFill(changed, node).foreground)).toBe(.5);
});


test('foreign colour lookalikes stay separate from native colour and opacity edits', () => {
  const { source, node } = fixture('<a:solidFill xmlns:u="urn:ignored-colour"><u:schemeClr val="accent1"><u:alpha val="10000"/></u:schemeClr><a:schemeClr val="accent2"><a:alpha val="50000"/></a:schemeClr></a:solidFill>');
  const before = readChartFill(source, node);
  expect(chartColorOpacity(before.foreground)).toBe(.5);
  expect(resolveChartColor(before.foreground, { themeColors: { accent2: '#FF0000' } })).toBe('rgba(255,0,0,0.5)');
  const changed = setChartSolidFill(source, node, { opacity: .3 }), after = readChartFill(changed, node);
  expect(after.foreground.value).toBe('accent2');
  expect(chartColorOpacity(after.foreground)).toBe(.3);
  expect(text(changed)).toContain('<u:schemeClr val="accent1">');
  expect(text(changed)).toContain('<u:alpha val="10000"/>');
});
