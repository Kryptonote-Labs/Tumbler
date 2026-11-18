import { expect, test } from 'bun:test';
import { applyPresentationCommand, createPresentation } from '@tumblerjs/slides';
import { renderPresentationSlideThumbnail } from '../src/presentation-slide-thumbnail.ts';

test('rotated text keeps the live SVG preview', async () => {
  const deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  const authored = applyPresentationCommand(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 10, y: 10, width: 100, height: 50 },
    object: { kind: 'shape', text: 'Vertical label' },
  });
  const { document } = authored;
  const slide = document.slides[0]!;
  const object = slide.objects[0]!;
  expect(object.text).toBeDefined();
  const rotated = { ...slide, objects: [{ ...object, text: { ...object.text!, rotation: 90 } }] };
  expect(await renderPresentationSlideThumbnail({
    presentation: document,
    slide: rotated,
    signal: new AbortController().signal,
  })).toBeUndefined();
});
