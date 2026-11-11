import { expect, test } from 'bun:test';
import { gradientFillMarkup, parseLosslessXml, readGradientFill } from '../src/index.ts';
const fill = { kind: 'gradient' as const, type: 'rectangular' as const, center: [0.25, 0.75] as [number,number], stops: [{offset: 0, color: '#123456'}, {offset: 1, color: '#abcdef', opacity: 0.3}] };
const read = (xml: string) => readGradientFill(parseLosslessXml(new TextEncoder().encode(xml)).root);
test('gradient geometry that the editor cannot preserve remains opaque', () => {
  const xml = gradientFillMarkup(fill).replace('<a:gradFill>', '<a:gradFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">');
  expect(read(xml)).toMatchObject({type: 'rectangular', center: [0.25,0.75]});
  expect(read(xml.replace('r="75000"', 'r="50000"'))).toBeUndefined();
  expect(read(xml.replace('</a:gradFill>', '<a:tileRect l="50000"/></a:gradFill>'))).toBeUndefined();
});

test('reading a linear gradient uses the native unscaled default and accepts XML booleans', () => {
  const xml = '<a:gradFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:gsLst><a:gs pos="0"><a:srgbClr val="000000"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst><a:lin ang="2700000"/></a:gradFill>';
  expect(read(xml)?.scaled).toBe(false);
  expect(read(xml.replace('ang="2700000"', 'ang="2700000" scaled="false"'))?.scaled).toBe(false);
  expect(read(xml.replace('ang="2700000"', 'ang="2700000" scaled="true"'))?.scaled).toBe(true);
});
