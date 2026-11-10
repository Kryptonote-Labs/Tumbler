import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { PdfTextModel, PdfEditingFonts, defaultPdfTextStyle, layoutPdfText, exportEditedPdf, openPdfDocument, PdfInterpreter } from '../src/index.ts';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fonts = new PdfEditingFonts();
fonts.add('Sans-Regular', await Bun.file(new URL('./fixtures/editing-fonts/LiberationSans-Regular.ttf', import.meta.url)).bytes());
function fixture() {
  const pdf = openPdfDocument(pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> /Contents 4 0 R >>',
    pdfStream(''),
  ]));
  const model = new PdfTextModel();
  model.add({ id: 'p', page: 0, x: 20, y: 40, width: 120, lineHeight: 15, sources: [], style: defaultPdfTextStyle,
    delta: [{ insert: 'One two three four five six seven\nLast', attributes: defaultPdfTextStyle }] });
  return { pdf, model };
}
test('character formatting merges with a peer paragraph edit and undoes independently', () => {
  const { model: a } = fixture(), b = new PdfTextModel();
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  a.format('p', 0, 3, { strike: true, background: '#ffff00' });
  b.formatParagraph('p', { alignment: 'center', lineSpacing: 2 });
  const ua = Y.encodeStateAsUpdate(a.doc), ub = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, ub); Y.applyUpdate(b.doc, ua);
  expect(a.text('p').toDelta()).toEqual(b.text('p').toDelta());
  expect(a.paragraph('p')).toEqual(b.paragraph('p'));
  expect(a.styleAt('p', 1).strike).toBe(true);
  expect(a.styleAt('p', 5).strike).toBeUndefined();
  a.undo.undo();
  expect(a.styleAt('p', 1).background).toBeUndefined();
  expect(a.paragraph('p').lineSpacing).toBe(2);
  a.undo.redo();
  expect(a.styleAt('p', 1).background).toBe('#ffff00');
  a.doc.destroy(); b.doc.destroy();
});
test('alignment moves glyphs and carets together, justification skips final and explicit lines', () => {
  const { model } = fixture();
  const left = layoutPdfText(model, 'p', fonts);
  for (const alignment of ['center', 'right', 'justify'] as const) {
    model.formatParagraph('p', { alignment, lineSpacing: 2 });
    const layout = layoutPdfText(model, 'p', fonts);
    for (const glyph of layout.glyphs)
      expect(layout.carets.find(c => c.offset === glyph.start)?.x).toBeCloseTo(glyph.x, 6);
    const line = layout.glyphs.filter(g => g.y === 40 && g.text.trim());
    if (alignment !== 'center') expect(line.at(-1)!.x + line.at(-1)!.width).toBeCloseTo(140, 6);
    if (alignment === 'justify') expect(layout.glyphs.at(-1)!.x).toBeLessThan(140 - 50);
    expect(layout.glyphs.find(g => g.y > 40)!.y).toBe(64);
  }
  expect(left.glyphs[0]!.x).toBe(20);
  model.doc.destroy();
});
test('export retains formatted text, backgrounds and strike paths in shared layout positions', async () => {
  const { pdf, model } = fixture();
  model.format('p', 0, 3, { strike: true, underline: true, background: '#ffff00' });
  model.formatParagraph('p', { alignment: 'right', lineSpacing: 2 });
  const bytes = exportEditedPdf(pdf, model, fonts);
  const scene = new PdfInterpreter(openPdfDocument(bytes)).page(0);
  expect(scene.text.replace(/\s+/g, '')).toBe('OnetwothreefourfivesixsevenLast');
  expect(scene.elements.filter(e => e.kind === 'path').length).toBeGreaterThanOrEqual(9);
  // Poppler checks text independently when installed. It runs on this tiny fixture only.
  if (Bun.which('pdftotext')) {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-format-'));
    try {
      const file = join(dir, 'formatted.pdf');
      await Bun.write(file, bytes);
      const result = Bun.spawnSync(['pdftotext', file, '-']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString().replace(/\s+/g, ' ')).toContain('One two three four five six seven Last');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  model.doc.destroy();
});
test('every offered face can be selected and exported using its own font program', () => {
  const { model, pdf } = fixture();
  expect(fonts.choices).toEqual([{ value: 'Sans-Regular', label: 'LiberationSans' }]);
  for (const choice of fonts.choices) {
    model.format('p', 0, model.text('p').length, { font: choice.value });
    expect(fonts.get(model.styleAt('p', 1), 'O').key).toBe(choice.value);
    expect(exportEditedPdf(pdf, model, fonts).length).toBeGreaterThan(0);
  }
  model.doc.destroy();
});

test('complete embedded TrueType faces become writable choices without changing imported identity', () => {
  const { pdf, model } = fixture();
  const exported = openPdfDocument(exportEditedPdf(pdf, model, fonts));
  const importedFonts = fonts.fork(exported);
  const choice = importedFonts.choices.find(face => face.value.startsWith('full:'));
  expect(choice).toBeDefined();
  const next = fixture().model;
  next.format('p', 0, next.text('p').length, importedFonts.selection(choice!.value));
  expect(importedFonts.get(next.styleAt('p', 1), 'O').key).toBe(choice!.value);
  expect(exportEditedPdf(pdf, next, importedFonts).length).toBeGreaterThan(0);
  model.doc.destroy(); next.doc.destroy();
});
