import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import {
  createPresentation,
  applyPresentationCommand as run,
  openPresentationArtifact,
  presentationThemeColours,
} from '../src/index.ts';
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
function fixture() {
  let deck = createPresentation();
  deck = run(deck, { name: 'insert-slide', index: 1 });
  const pkg = deck.document.package;
  const part = pkg.getPart('/ppt/theme/theme1.xml')!;
  const theme = decoder
    .decode(pkg.readPart(part))
    .replace(/<a:accent1>.*?<\/a:accent1>/s, '<a:accent1><a:srgbClr val="123456"/></a:accent1>')
    .replace(/<a:accent2>.*?<\/a:accent2>/s, '<a:accent2><a:srgbClr val="654321"/></a:accent2>');
  deck = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(part.name.value, encoder.encode(theme)).commit(),
  );
  return { deck, theme };
}
test('palette follows the deck theme and rejects unknown slide IDs', () => {
  const { deck } = fixture();
  const palette = presentationThemeColours(deck.document, deck.document.slides[0]!.id);
  expect(palette.color('accent1')).toBe('123456');
  expect(palette.color('accent2')).toBe('654321');
  expect(() => presentationThemeColours(deck.document, 'missing')).toThrow('Slide not found');
});
test('a slide override changes only that slide palette', () => {
  const { deck, theme } = fixture();
  const slide = deck.document.slides[0]!;
  const scheme = theme
    .match(/<a:clrScheme\b.*?<\/a:clrScheme>/s)![0]
    .replace('val="123456"', 'val="ABCDEF"');
  const tx = beginPackageTransaction(deck.document.package);
  const part = '/ppt/theme/slideOverride.xml';
  tx.addPart(
    part,
    'application/vnd.openxmlformats-officedocument.themeOverride+xml',
    encoder.encode(
      `<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${scheme}</a:themeOverride>`,
    ),
  );
  tx.addRelationship(slide.part, {
    id: 'paletteOverride',
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride',
    target: part,
  });
  const changed = openPresentationArtifact(tx.commit());
  expect(presentationThemeColours(changed.document, slide.id).color('accent1')).toBe('ABCDEF');
  expect(
    presentationThemeColours(changed.document, changed.document.slides[1]!.id).color('accent1'),
  ).toBe('123456');
});
test('palette applies the same colour remapping as the slide renderer', () => {
  const { deck } = fixture();
  const pkg = deck.document.package;
  const master = pkg.getPart('/ppt/slideMasters/slideMaster1.xml')!;
  const xml = decoder
    .decode(pkg.readPart(master))
    .replace('accent1="accent1"', 'accent1="accent2"');
  const changed = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(master.name.value, encoder.encode(xml)).commit(),
  );
  expect(
    presentationThemeColours(changed.document, changed.document.slides[0]!.id).color('accent1'),
  ).toBe('654321');
});

test('decks without a theme retain the default Office palette', () => {
  const deck = createPresentation();
  const tx = beginPackageTransaction(deck.document.package).removeRelationship(
    '/ppt/slideMasters/slideMaster1.xml',
    'rIdTheme',
  );
  const changed = openPresentationArtifact(tx.commit());
  expect(
    presentationThemeColours(changed.document, changed.document.slides[0]!.id).color('accent1'),
  ).toBe('156082');
});

test('background and text palette slots use DrawingML aliases when remapped', () => {
  const { deck } = fixture();
  const pkg = deck.document.package;
  const master = pkg.getPart('/ppt/slideMasters/slideMaster1.xml')!;
  const xml = decoder
    .decode(pkg.readPart(master))
    .replace('bg1="lt1"', 'bg1="dk1"')
    .replace('tx1="dk1"', 'tx1="lt1"')
    .replace('bg2="lt2"', 'bg2="dk2"')
    .replace('tx2="dk2"', 'tx2="lt2"');
  const changed = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(master.name.value, encoder.encode(xml)).commit(),
  );
  const before = presentationThemeColours(deck.document, deck.document.slides[0]!.id);
  const after = presentationThemeColours(changed.document, changed.document.slides[0]!.id);
  expect(after.color('lt1')).toBe(before.color('dk1'));
  expect(after.color('dk1')).toBe(before.color('lt1'));
  expect(after.color('lt2')).toBe(before.color('dk2'));
  expect(after.color('dk2')).toBe(before.color('lt2'));
});
