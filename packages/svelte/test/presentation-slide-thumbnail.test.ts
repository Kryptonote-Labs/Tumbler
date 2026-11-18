import { expect, test } from 'bun:test';
import { applyPresentationCommand, createPresentation } from '@tumblerjs/slides';
import { renderPresentationSlideThumbnail } from '../src/presentation-slide-thumbnail.ts';

test('rotated text and tab stops keep the live SVG preview', async () => {
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
  const text = object.text!;
  const tabbed = {
    ...text,
    paragraphs: text.paragraphs.map((paragraph) => ({
      ...paragraph,
      tabs: [{ position: 200, alignment: 'l' }],
      runs: paragraph.runs.map((run) => ({ ...run, text: 'A\tB' })),
    })),
  };
  for (const layout of [{ ...text, rotation: 90 }, tabbed]) {
    const preview = await renderPresentationSlideThumbnail({
      presentation: document,
      slide: { ...slide, objects: [{ ...object, text: layout }] },
      signal: new AbortController().signal,
    });
    expect(preview).toBeUndefined();
  }
});
