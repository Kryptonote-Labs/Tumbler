import { expect, test } from 'bun:test';
import { openPdfDocument, PdfEditingFonts, PdfInterpreter } from '../src/index.ts';

const bytes = await Bun.file(new URL('./fixtures/chromium-typography.pdf', import.meta.url)).bytes();

test('cooperative font preparation yields before parsing and preserves source glyph mappings', async () => {
  const document = openPdfDocument(bytes);
  const base = new PdfEditingFonts();
  let yields = 0;
  const prepared = await base.forkAsync(document, async () => { yields++; });
  expect(yields).toBe(document.pages.length + 1);
  const sync = base.fork(document);
  const interpreter = new PdfInterpreter(document);
  let glyphs = 0;
  for (const page of document.pages) {
    for (const element of interpreter.page(page.index).elements) {
      if (element.kind !== 'glyph' || !element.font.program || !element.font.sourceId || !element.glyph.unicode) continue;
      const style = {
        family: 'Sans' as const, size: 12, bold: false, italic: false,
        underline: false, color: '#000000', font: element.font.sourceId,
      };
      expect(prepared.measure(element.glyph.unicode, style)).toBe(sync.measure(element.glyph.unicode, style));
      glyphs++;
    }
  }
  expect(glyphs).toBeGreaterThan(0);
  expect(base.sourceFamilies.size).toBe(0);
});

test('a host can cancel font preparation before any page scan', async () => {
  const document = openPdfDocument(bytes);
  const base = new PdfEditingFonts();
  const cancelled = new Error('cancelled');
  await expect(base.forkAsync(document, () => Promise.reject(cancelled))).rejects.toBe(cancelled);
  expect((await base.forkAsync(document, async () => {})).sourceFamilies.size).toBeGreaterThan(0);
});
