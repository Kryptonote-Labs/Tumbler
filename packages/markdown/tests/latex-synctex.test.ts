import { expect, test } from 'bun:test';
import { readLatexSyncTex } from '../src/latex';

test('SyncTeX locates a primary source line on its physical output page', () => {
  const units = (pt: number) => Math.round((pt * 65536 * 72.27) / 72);
  const record = (file: number, line: number, x: number, y: number) =>
    `x${file},${line}:${units(x)},${units(y)}`;
  const layout = readLatexSyncTex(
    [
      'SyncTeX Version:1',
      'Input:1:/tex/document.tex',
      'Input:2:/tex/package.sty',
      'Unit:1',
      'Magnification:1000',
      'X Offset:0',
      'Y Offset:0',
      'Content:',
      '{1',
      record(1, 5, 160, 210),
      record(2, 100, 180, 230),
      '}',
      '{2',
      record(1, 19, 160, 100),
      record(1, 22, 160, 115),
      '}',
    ].join('\n'),
  )!;
  expect(layout.lineAt(0, 180, 231)).toBe(5);
  expect(layout.lineAt(1, 158, 112)).toBe(22);
  expect(layout.lineAt(2, 158, 112)).toBeUndefined();
});
