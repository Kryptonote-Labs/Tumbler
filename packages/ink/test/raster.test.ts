import { expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { createOfficeInkScene, encodeInkPng, INK_RASTER_OPERATIONS, readOfficeInk, renderOfficeInkRaster } from '../src/index.ts';
import { bytes, officeInk } from './fixture.ts';
const property = (name: string, value: string, units = '') => `<brushProperty name="${name}" value="${value}"${units ? ` units="${units}"` : ''}/>`;
const pen = property('width', '1', 'in') + property('height', '1', 'in') + property('antiAliased', 'false');
const read = (brush: string, trace = '0 0') => readOfficeInk(bytes(officeInk({ brush, trace })));

test('raster compositor obeys all sixteen Office truth tables against actual destination pixels', () => {
  const tables = [0, 12, 4, 2, 8, 11, 14, 13, 10, 5, 3, 7, 1, 9, 15, 6];
  for (const [index, operation] of INK_RASTER_OPERATIONS.entries()) {
    // Mixed bits exercise all four inputs in a single pixel. Duplicate samples must not apply XOR twice.
    const destination = new Uint8Array([0x55, 0x55, 0x55, 255]);
    const result = renderOfficeInkRaster(read(pen + property('color', '#333333') + property('rasterOp', operation), '0 0,0 0'), {
      bounds: { x: -.5, y: -.5, width: 1, height: 1 }, scale: 1, destination,
    });
    expect(result.supported).toBe(true);
    if (!result.supported) continue;
    let expected = 0;
    for (let bit = 0; bit < 8; bit++) expected |= ((tables[index]! >> (((0x33 >> bit) & 1) * 2 + ((0x55 >> bit) & 1))) & 1) << bit;
    expect([...result.data]).toEqual([expected, expected, expected, 255]);
    expect([...destination]).toEqual([85, 85, 85, 255]);
  }
});

test('transparency is applied once to a union of overlapping nibs', () => {
  const result = renderOfficeInkRaster(read(pen + property('transparency', '128'), '0 0,0 0,0 0'), { bounds: { x: -.5, y: -.5, width: 1, height: 1 }, scale: 1 });
  expect(result.supported && [...result.data]).toEqual([0, 0, 0, 127]);
});

test('destination-dependent ink requires an explicit backdrop', () => {
  const ink = read(pen + property('rasterOp', 'xOrPen'));
  expect(renderOfficeInkRaster(ink)).toMatchObject({ supported: false, diagnostics: [{ code: 'destination' }] });
  expect(renderOfficeInkRaster(ink, { background: [255, 255, 255] }).supported).toBe(true);
});

test('rotating an asymmetric nib rotates its physical bounds', () => {
  const ink = readOfficeInk(bytes(officeInk({ channels: '<channel name="X"/><channel name="Y"/><channel name="OR" units="deg"/>', trace: '0 0 90', brush: property('width', '2', 'in') + property('height', '1', 'in') })));
  const result = createOfficeInkScene(ink);
  expect(result.supported).toBe(true);
  if (!result.supported) return;
  expect(result.bounds.width).toBeCloseTo(72);
  expect(result.bounds.height).toBeCloseTo(144);
});

test('curve fitting keeps endpoints, bends between gentle samples and respects work budgets', () => {
  const ink = read(pen + property('fitToCurve', 'true'), '0 0,1000 200,2000 0');
  const curved = createOfficeInkScene(ink);
  const linear = createOfficeInkScene(read(pen, '0 0,1000 200,2000 0'));
  expect(curved.supported && linear.supported && curved.strokes[0]!.shapes.length > linear.strokes[0]!.shapes.length).toBe(true);
  expect(createOfficeInkScene(ink, { maxPoints: 3 })).toMatchObject({ supported: false, diagnostics: [{ code: 'resource' }] });
});

test('portable PNG has valid checksums, dimensions and independently decompressible scanlines across block boundaries', () => {
  const pixels = new Uint8Array(200 * 100 * 4).map((_, i) => i % 251);
  const png = encodeInkPng(200, 100, pixels);
  expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer);
  let compressed: Uint8Array = new Uint8Array();
  for (let offset = 8; offset < png.length;) {
    const length = view.getUint32(offset), type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    // An independent bit-at-a-time CRC oracle checks every chunk.
    let crc = -1;
    for (const byte of png.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    expect(view.getUint32(offset + 8 + length)).toBe((~crc) >>> 0);
    if (type === 'IHDR') expect([...data]).toEqual([0, 0, 0, 200, 0, 0, 0, 100, 8, 6, 0, 0, 0]);
    if (type === 'IDAT') compressed = data;
    offset += length + 12;
  }
  const raw = inflateSync(compressed);
  for (let row = 0; row < 100; row++) {
    expect(raw[row * 801]).toBe(0);
    expect(new Uint8Array(raw.subarray(row * 801 + 1, (row + 1) * 801))).toEqual(pixels.subarray(row * 800, (row + 1) * 800));
  }
});
