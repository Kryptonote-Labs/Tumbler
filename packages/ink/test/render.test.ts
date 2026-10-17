import { expect, test } from 'bun:test';
import { applyInkRasterOperation, INK_RASTER_OPERATIONS, readOfficeInk, renderOfficeInkSvg } from '../src/index.ts';
import { bytes, officeInk } from './fixture.ts';

const read = (options: Parameters<typeof officeInk>[0] = {}) => readOfficeInk(bytes(officeInk(options)));
const render = (options: Parameters<typeof officeInk>[0] = {}) => {
  const result = renderOfficeInkSvg(read(options));
  if (!result.supported) throw Error(JSON.stringify(result.diagnostics));
  return result;
};
const property = (name: string, value: string, units?: string) => `<brushProperty name="${name}" value="${value}"${units === undefined ? '' : ` units="${units}"`}/>`;

test('physical units and pen extents are independent from drawing placement', () => {
  const result = render();
  expect(result.traceBounds).toEqual({ x: 0, y: 0, width: 72 / 2.54, height: 72 / 2.54 });
  expect(result.bounds.x).toBeCloseTo(-.025 * 72 / 2.54);
  expect(result.bounds.width).toBeCloseTo(1.05 * 72 / 2.54);
  expect(result.svg).not.toMatch(/NaN|Infinity|script|href/);
  const inch = render({ properties: '<channelProperty channel="X" name="resolution" value="1000" units="1/in"/><channelProperty channel="Y" name="resolution" value="1000" units="1/in"/>' });
  expect(inch.traceBounds.width).toBe(72);
});

test('zero-length traces retain a visible nib and do not divide by zero', () => {
  const result = render({ trace: '1 0,1 0' });
  expect(result.traceBounds.width).toBe(0);
  expect(result.bounds.width).toBeCloseTo(.05 * 72 / 2.54);
  expect(result.svg).toContain('<ellipse');
  expect(result.svg).not.toMatch(/NaN|Infinity/);
});

test('Office brush defaults and invalid-value fallback match the profile', () => {
  const brush = read({ brush: '' }).traces[0]!.brush;
  expect(brush).toEqual({ widthPoints: .053 * 72 / 2.54, heightPoints: .001 * 72 / 2.54, color: '#000000', transparency: 0, tip: 'ellipse', rasterOp: 'copyPen', antiAliased: true, fitToCurve: false, ignorePressure: false });
  const invalid = read({ brush: property('color', 'red') + property('width', '1e3', 'cm') + property('height', '-1', 'cm') + property('transparency', '256') + property('tip', 'drop') + property('antiAliased', 'yes') + property('rasterOp', 'invalid') }).traces[0]!.brush;
  expect(invalid).toEqual(brush);
});

test('transparency applies once per stroke, rectangle nibs sweep a polygon, XML is not injected', () => {
  const result = render({ brush: property('tip', 'rectangle') + property('transparency', '128') + property('antiAliased', '0') + property('color', '&quot; onload=&quot;alert(1)') });
  expect(result.svg).toContain('<rect');
  expect(result.svg).toContain('<polygon');
  expect(result.svg.match(/opacity=/g)).toHaveLength(1);
  expect(result.svg).toContain('shape-rendering="crispEdges"');
  expect(result.svg).not.toContain('onload');
});

test('pressure, pen switches and ignorePressure have explicit rendering semantics', () => {
  const channels = '<channel name="X"/><channel name="Y"/><channel name="F" min="0" max="100"/><channel name="S" type="boolean"/>';
  const result = render({ channels, trace: '0 0 100 T,1000 1000 50 F,2000 0 0 T' });
  expect(result.svg.match(/<ellipse/g)).toHaveLength(2);
  expect(result.svg).not.toContain('<polygon');
  expect(result.svg).toContain('rx="0"');
  const ignored = render({ channels, trace: '0 0 0 T', brush: property('ignorePressure', 'true') });
  expect(ignored.bounds.width).toBeCloseTo(.053 * 72 / 2.54);
});

test.each([
  { properties: '' },
  { properties: '<channelProperty channel="X" name="resolution" value="0" units="1/cm"/>' },
  { brush: property('fitToCurve', 'true') },
  { brush: property('rasterOp', 'xOrPen') },
  { channels: '<channel name="X"/><channel name="Y"/><channel name="F"/>', trace: '0 0 1' },
  { channels: '<channel name="X"/><channel name="Y"/><channel name="OR"/>', trace: '0 0 10' },
  { channels: '<channel name="X"/><channel name="Y"/><channel name="S"/>', trace: '0 0 1' },
  { trace: '' },
])('reports unsupported rendering rather than drawing a partial result: %j', options => {
  const result = renderOfficeInkSvg(read(options));
  expect(result.supported).toBe(false);
  if (!result.supported) expect(result.diagnostics.length).toBeGreaterThan(0);
});

test('all 16 raster operations match the Windows ROP2 four-bit truth tables', () => {
  // Bits ordered P=0,D=0; P=0,D=1; P=1,D=0; P=1,D=1.
  const tables = [0, 12, 2, 4, 8, 11, 14, 13, 10, 5, 3, 7, 1, 9, 15, 6];
  for (const [index, operation] of INK_RASTER_OPERATIONS.entries()) {
    for (let p = 0; p <= 1; p++) for (let d = 0; d <= 1; d++) {
      expect(applyInkRasterOperation(operation, p ? 0xffffff : 0, d ? 0xffffff : 0)).toBe((tables[index]! >> (p * 2 + d)) & 1 ? 0xffffff : 0);
    }
  }
});
