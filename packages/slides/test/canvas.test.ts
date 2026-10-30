import { expect, test } from 'bun:test';
import {
  applyPresentationCommand,
  createPresentation,
  paintPresentationSlide,
  presentationSlideImages,
  type SlideCanvasContext,
} from '../src/index.ts';

test('portable painter retains background, authored text styles and object transforms without editor prompts', () => {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, { name: 'layout', slideId, layout: 'title' });
  const textKey = deck.document.slides[0]!.objects[0]!.key;
  deck = applyPresentationCommand(deck, {
    name: 'edit-text',
    slideId,
    objectKey: textKey,
    start: 0,
    end: 0,
    value: 'A real slide',
  });
  deck = applyPresentationCommand(deck, { name: 'background', slideId, color: '#ffcc88' });
  const painted: { text: string; font: string }[] = [];
  const fills: unknown[] = [];
  const transforms: number[][] = [];
  const noop = () => {};
  const ctx: SlideCanvasContext<string, string> = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    rect: noop,
    arc: noop,
    moveTo: noop,
    lineTo: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    drawImage: noop,
    transform: (...values) => {
      transforms.push(values);
    },
    fillRect: () => {
      fills.push(ctx.fillStyle);
    },
    measureText: (value) => ({ width: value.length * 10 }),
    fillText: (text) => {
      painted.push({ text, font: ctx.font });
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const slide = deck.document.slides[0]!;
  paintPresentationSlide(ctx, deck.document, slide, {
    path: (d) => d,
    prepareFont: () => 'Host font',
  });
  expect(fills[0]).toBe('rgba(255,204,136,1)');
  expect(painted.map((p) => p.text).join('')).toBe('A real slide');
  expect(painted.every((p) => p.font.includes('80px') && p.font.includes('Host font'))).toBe(true);
  expect(transforms[0]).toEqual([...slide.objects[0]!.matrix]);
  expect(presentationSlideImages(slide)).toEqual([]);
});
