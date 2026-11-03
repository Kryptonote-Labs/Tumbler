import { expect, test } from 'bun:test';
import {
  applyPresentationCommand,
  createPresentation,
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
