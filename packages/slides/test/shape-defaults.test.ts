import { expect, test } from 'bun:test';
import {
  applyPresentationCommand,
  createPresentation,
  importNativePresentation,
  openPresentationArtifact,
} from '../src/index.ts';

test('new shapes retain centred text alignment when typing and reopening the deck', () => {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 100, y: 100, width: 300, height: 150 },
    object: { kind: 'shape', geometry: 'ellipse' },
  });
  const shape = deck.document.slides[0]!.objects.at(-1)!;
  expect(shape.text).toMatchObject({ anchor: 'center', paragraphs: [{ align: 'center' }] });

  deck = applyPresentationCommand(deck, {
    name: 'edit-text',
    slideId,
    objectKey: shape.key,
    start: 0,
    end: 0,
    value: 'First line\nSecond line',
  });
  const reopened = openPresentationArtifact(deck.bytes()).document.slides[0]!.objects.at(-1)!;
  expect(reopened.text?.anchor).toBe('center');
  expect(reopened.text?.paragraphs.map((paragraph) => paragraph.align)).toEqual([
    'center',
    'center',
  ]);
});

test('new text boxes retain top left text alignment', () => {
  const original = createPresentation();
  const deck = applyPresentationCommand(original, {
    name: 'insert-object',
    slideId: original.document.slides[0]!.id,
    bounds: { x: 100, y: 100, width: 300, height: 150 },
    object: { kind: 'shape' },
  });
  expect(deck.document.slides[0]!.objects.at(-1)!.text).toMatchObject({
    anchor: 'top',
    paragraphs: [{ align: 'left' }],
  });
});

test('shape insertion keeps authored text style and layout through PPTX and native editing', () => {
  for (const deck of [createPresentation(), importNativePresentation(createPresentation())]) {
    const inserted = applyPresentationCommand(deck, {
      name: 'insert-object',
      slideId: deck.document.slides[0]!.id,
      bounds: { x: 100, y: 100, width: 300, height: 150 },
      object: {
        kind: 'shape',
        geometry: 'rect',
        text: 'A label\n',
        fontFamily: 'A & B',
        fontSize: 18,
        bold: true,
        textColor: '#123456',
        horizontalAlignment: 'end',
        verticalAlignment: 'bottom',
        textInset: [2, 4, 6, 8],
      },
    });
    const style = { fontFamily: 'A & B', fontSize: 24, bold: true, color: 'rgba(18,52,86,1)' };
    for (const artifact of [inserted, openPresentationArtifact(inserted.bytes())]) {
      expect(artifact.document.slides[0]!.objects[0]!.text).toMatchObject({
        anchor: 'bottom',
        inset: [2, 4, 6, 8],
        paragraphs: [
          { align: 'right', runs: [{ text: 'A label', ...style }] },
          { align: 'right', endRun: style },
        ],
      });
    }
  }
});
