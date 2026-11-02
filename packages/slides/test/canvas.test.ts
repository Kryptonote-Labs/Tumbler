import { expect, test } from 'bun:test';
import {
  applyPresentationCommand,
  createPresentation,
  paintPresentationSlide,
  presentationSlideImages,
  type SlideCanvasContext,
  type SlideText,
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

for (const anchor of ['top', 'center', 'bottom'] as const) {
  test(`normal autofit preserves saved sizes and ${anchor} anchoring when text overflows`, async () => {
    const { paintSlideText } =
      await import('../src/canvas-text.ts');
    let scaleY = 1,
      offsetY = 0;
    const painted: { text: string; size: number; y: number }[] = [];
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
      rotate: noop,
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
      transform: noop,
      fillRect: noop,
      translate: (_x, y) => {
        offsetY += y * scaleY;
      },
      scale: (_x, y) => {
        scaleY *= y;
      },
      measureText: (value) => ({ width: value.length * 10 }),
      fillText: (text, _x, y) => {
        painted.push({
          text,
          size: Number(/([\d.]+)px/.exec(ctx.font)![1]) * scaleY,
          y: offsetY + y * scaleY,
        });
      },
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    };
    const text: SlideText = {
      autoFit: 'normal',
      anchor,
      wrap: true,
      inset: [0, 0, 0, 0],
      textElementId: undefined,
      paragraphs: ['THIS IS WHAT', 'COMPOUNDING', 'LOOKS LIKE.'].map((value) => ({
        runs: [
          {
            text: value,
            fontFamily: 'Arial',
            fontSize: 80,
            color: '#b6ff3b',
            bold: true,
            italic: false,
            underline: false,
          },
        ],
        align: 'left',
        bullet: '',
        marginLeft: 0,
        indent: 0,
        before: 0,
        after: 0,
        lineHeight: 1,
      })),
    };
    paintSlideText(ctx, text, 1104, 140, { path: (d) => d });
    expect(painted.every((run) => run.size === 80)).toBe(true);
    expect(painted.map((run) => run.text).join('')).toBe('THIS IS WHATCOMPOUNDINGLOOKS LIKE.');
    expect(painted[0]!.y).toBe(64 + (anchor === 'top' ? 0 : anchor === 'center' ? -50 : -100));
    expect(painted.at(-1)!.y - painted[0]!.y).toBe(160);
  });
}
