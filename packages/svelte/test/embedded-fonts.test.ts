import { expect, test } from 'bun:test';
import { browserWordTextMeasurer, wordTextCss } from '../src/word-font-metrics.ts';
import { loadEmbeddedFonts } from '../src/embedded-fonts.ts';

test('font aliases ignore family casing, isolate browser documents and settle failed loads', async () => {
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const face = Object.getOwnPropertyDescriptor(globalThis, 'FontFace');
  const faces = new Set<Face>();
  const otherFaces = new Set<Face>();
  const loaded: Face[] = [];
  class Face {
    constructor(readonly family: string, readonly data: ArrayBuffer, readonly descriptors: FontFaceDescriptors) { if (new Uint8Array(data)[0] === 3) throw new Error('invalid face'); loaded.push(this); }
    load() { return this.descriptors.style === 'italic' ? Promise.reject(new Error('bad font')) : Promise.resolve(this); }
  }
  Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: Face });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: faces } });
  try {
    const fonts = [
      { family: 'Example', bold: false, italic: false, bytes: new Uint8Array([1]) },
      { family: 'EXAMPLE', bold: true, italic: true, bytes: new Uint8Array([2]) },
      { family: 'Empty', bold: false, italic: false, bytes: new Uint8Array() },
      { family: 'Invalid', bold: false, italic: false, bytes: new Uint8Array([3]) },
    ];
    const main = loadEmbeddedFonts(fonts);
    expect(await main.ready).toBeUndefined();
    const results = await main.results;
    expect(results.map(result => result.status)).toEqual(['loaded', 'failed', 'failed', 'failed']);
    expect(results[1]?.font).toBe(fonts[1]);
    expect(results[1]?.status === 'failed' && results[1].error).toEqual(new Error('bad font'));
    expect(main.family('example')).toBe(main.family('Example').replace('"Example"', '"example"'));
    const format = { fontFamily: 'Example', fontSizePoints: 12, bold: false, italic: false, underline: 'none' as const, strike: false, color: '#000', highlight: undefined, verticalAlign: 'baseline' as const, rightToLeft: false };
    const context = { font: '', direction: 'ltr' as const, measureText: () => ({ width: 100 }) };
    browserWordTextMeasurer(context, main.family).measure('Alias', format);
    expect(context.font).toContain(loaded[0]!.family);
    expect(wordTextCss(format, undefined, main.family)).toContain(loaded[0]!.family);
    expect(loaded[0]!.family).toBe(loaded[1]!.family);
    expect(loaded[1]!.descriptors).toEqual({ weight: '700', style: 'italic' });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: otherFaces } });
    const other = loadEmbeddedFonts(fonts);
    await other.ready;
    expect(other.family('Example')).not.toBe(main.family('Example'));
    main.destroy();
    expect(faces.size).toBe(0);
    expect(otherFaces.size).toBe(2);
    other.destroy();
    expect(otherFaces.size).toBe(0);
  } finally {
    if (doc) Object.defineProperty(globalThis, 'document', doc); else Reflect.deleteProperty(globalThis, 'document');
    if (face) Object.defineProperty(globalThis, 'FontFace', face); else Reflect.deleteProperty(globalThis, 'FontFace');
  }
});
