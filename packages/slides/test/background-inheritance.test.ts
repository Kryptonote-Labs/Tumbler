import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as apply,
  createPresentation,
  importNativePresentation,
  openPresentationArtifact,
  slideColorHex,
} from '../src/index.ts';

test('apply to all replaces overrides and new layouts inherit the exported master background', () => {
  const source = createPresentation();
  const deck = importNativePresentation(source);
  const slideId = deck.document.slides[0]!.id;
  const withOverride = apply(deck, {
    name: 'set-background',
    slideId,
    fill: { kind: 'solid', color: '#ff0000' },
  });
  const coloured = apply(withOverride, {
    name: 'set-background',
    slideId,
    scope: 'presentation',
    fill: { kind: 'solid', color: '#334455' },
  });
  const inserted = apply(coloured, { name: 'insert-slide', index: 1 });
  const newId = inserted.document.slides[1]!.id;
  const withLayout = apply(inserted, { name: 'layout', slideId: newId, layout: 'title' });
  const another = apply(withLayout, { name: 'insert-slide', index: 2 });
  const reset = apply(another, { name: 'set-background', slideId, fill: { kind: 'inherit' } });
  expect(reset.document.slides.map((slide) => slideColorHex(slide.background))).toEqual(
    Array(3).fill('#334455'),
  );

  const reopened = openPresentationArtifact(reset.bytes());
  expect(reopened.document.slides.map((slide) => slideColorHex(slide.background))).toEqual(
    Array(3).fill('#334455'),
  );
  const added = apply(reopened, { name: 'insert-slide', index: 3 });
  expect(slideColorHex(added.document.slides[3]!.background)).toBe('#334455');

  const pkg = reopened.document.package;
  const master = pkg.getPart('/ppt/slideMasters/slideMaster1.xml')!;
  expect(new TextDecoder().decode(pkg.readPart(master))).toContain('val="334455"');
});
