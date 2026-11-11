import { expect, test } from 'bun:test';
import { chartBase64ToBytes, chartBytesToBase64 } from '../src/index.ts';

test('large valid base64 payloads do not depend on a regular-expression work budget', () => {
  const encoded = 'AQID'.repeat(2 * 1024 * 1024), bytes = chartBase64ToBytes(encoded);
  expect(bytes.length).toBe(6 * 1024 * 1024);
  expect([...bytes.slice(0, 3)]).toEqual([1, 2, 3]);
  expect([...bytes.slice(-3)]).toEqual([1, 2, 3]);
  expect(chartBytesToBase64(bytes)).toBe(encoded);
});

test('base64 validation retains canonical grouping and terminal padding requirements', () => {
  for (const value of ['A', 'AAA', 'A===', '====', 'AA=A', 'AA?A', 'AAAA\n', 'AA=\n']) expect(() => chartBase64ToBytes(value)).toThrow('Invalid base64');
  for (const value of ['', 'AQ==', 'AQI=', 'AQID']) expect(chartBytesToBase64(chartBase64ToBytes(value))).toBe(value);
});
