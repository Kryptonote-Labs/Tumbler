import { expect, test } from 'bun:test';
import { Image } from '@napi-rs/canvas';
import { officeMetafileSvg } from '../src/metafile.ts';

/** A synthetic placeable WMF with a rectangle and an EOF record. */
function rectangleWmf() {
  const bytes = new Uint8Array(60), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x9ac6cdd7, true);
  view.setInt16(10, 100, true); view.setInt16(12, 80, true); view.setUint16(14, 1440, true);
  view.setUint16(22, 1, true); view.setUint16(24, 9, true); view.setUint16(26, 0x0300, true);
  view.setUint32(28, 19, true); view.setUint16(32, 1, true); view.setUint32(34, 7, true);
  view.setUint32(40, 7, true); view.setUint16(44, 0x041b, true);
  view.setInt16(46, 60, true); view.setInt16(48, 80, true); view.setInt16(50, 10, true); view.setInt16(52, 10, true);
  view.setUint32(54, 3, true);
  return bytes;
}
function rectangleEmf() {
  const bytes = new Uint8Array(132), view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true); view.setUint32(4, 88, true);
  view.setInt32(16, 100, true); view.setInt32(20, 80, true);
  view.setUint32(40, 0x464d4520, true); view.setUint32(44, 0x10000, true);
  view.setUint32(48, bytes.length, true); view.setUint32(52, 3, true); view.setUint16(56, 1, true);
  view.setInt32(72, 100, true); view.setInt32(76, 80, true); view.setInt32(80, 100, true); view.setInt32(84, 80, true);
  view.setUint32(88, 43, true); view.setUint32(92, 24, true);
  view.setInt32(96, 10, true); view.setInt32(100, 10, true); view.setInt32(104, 80, true); view.setInt32(108, 60, true);
  view.setUint32(112, 14, true); view.setUint32(116, 20, true); view.setUint32(128, 20, true);
  return bytes;
}
test('headless metafiles produce decodable SVG without installing a global document', async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const svg = officeMetafileSvg(rectangleWmf(), 'image/x-wmf');
  expect(svg).toContain('<rect');
  expect(svg).toContain('width="100"');
  expect(Object.getOwnPropertyDescriptor(globalThis, 'document')).toEqual(before);
  const image = new Image(); image.src = Buffer.from(svg); await image.decode();
  expect([image.width, image.height]).toEqual([100, 80]);
  expect(officeMetafileSvg(rectangleWmf(), 'image/wmf')).toContain('<rect');
  const emf = officeMetafileSvg(rectangleEmf(), 'image/x-emf');
  expect(emf).toContain('<rect');
  image.src = Buffer.from(emf); await image.decode();
  expect([image.width, image.height]).toEqual([100, 80]);
});
test('malformed metafiles report failure without changing host globals', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  expect(() => officeMetafileSvg(new Uint8Array(4), 'image/x-emf')).toThrow();
  expect(Object.getOwnPropertyDescriptor(globalThis, 'document')).toEqual(before);
});
