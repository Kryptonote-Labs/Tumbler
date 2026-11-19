import { expect, test } from 'bun:test';
import type { SlideCanvasContext, SlideText } from '../src/index.ts';

import {
  applyPresentationCommand,
  createPresentation,
  paintPresentationSlide,
} from '../src/index.ts';
import { paintSlideText } from '../src/canvas-text.ts';

function recordingCanvas(metrics?: {
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;
}) {
  let scaleY = 1,
    offsetY = 0;
  const painted: { text: string; size: number; x: number; y: number }[] = [];
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
    measureText: (value) => ({ width: value.length * 10, ...metrics }),
    fillText: (text, x, y) => {
      painted.push({
        text,
        x,
        size: Number(/([\d.]+)px/.exec(ctx.font)![1]) * scaleY,
        y: offsetY + y * scaleY,
      });
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return { ctx, painted };
}

function authoredText(value: string, fontSize = 24) {
  const deck = createPresentation();
  const artifact = applyPresentationCommand(deck, {
    name: 'insert-object',
    slideId: deck.document.slides[0]!.id,
    bounds: { x: 0, y: 0, width: 500, height: 200 },
    object: { kind: 'shape', text: value, fontSize },
  });
  return {
    ...artifact.document.slides[0]!.objects[0]!.text!,
    inset: [0, 0, 0, 0],
  } satisfies SlideText;
}

for (const anchor of ['top', 'center', 'bottom'] as const) {
  test(`normal autofit preserves saved sizes and ${anchor} anchoring when text overflows`, () => {
    const { ctx, painted } = recordingCanvas();
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

test('soft wraps consume separator spaces and preserve authored hard-line indentation', () => {
  const { ctx, painted } = recordingCanvas();
  const text = authoredText('AI proposes alternatives and edge cases.\n  Indented');
  paintSlideText(ctx, text, 240, 200, { path: (d) => d });
  const lines = new Map<number, string>();
  for (const run of painted) lines.set(run.y, (lines.get(run.y) ?? '') + run.text);
  expect([...lines.values()]).toEqual([
    'AI proposes alternatives',
    'and edge cases.',
    '  Indented',
  ]);
});

test('empty layout placeholders paint no prompt or bullet', () => {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, { name: 'layout', slideId, layout: 'title-content' });
  const slide = deck.document.slides[0]!;
  expect(slide.objects.some((item) => item.text?.paragraphs[0]?.bullet === '•')).toBe(true);
  const { ctx, painted } = recordingCanvas();
  paintPresentationSlide(ctx, deck.document, slide, { path: (d) => d });
  expect(painted).toEqual([]);
});

test('proportional spacing scales the font box and fixed spacing sets the baseline distance', () => {
  const text = authoredText('Alpha\nBeta', 18);
  const paragraph = text.paragraphs[0]!;
  for (const [lineHeight, baseline, advance] of [
    [1.25, 26, 40],
    ['28px', 20, 28],
  ] as const) {
    const { ctx, painted } = recordingCanvas({
      fontBoundingBoxAscent: 22,
      fontBoundingBoxDescent: 10,
    });
    paintSlideText(
      ctx,
      { ...text, paragraphs: text.paragraphs.map((p) => ({ ...p, lineHeight })) },
      500,
      200,
      { path: (d) => d },
    );
    expect(paragraph.runs[0]?.fontSize).toBe(24);
    expect(painted.map((run) => run.y)).toEqual([baseline, baseline + advance]);
  }
});

test('justify expands spaces on wrapped lines and leaves the final line at the start', () => {
  const { ctx, painted } = recordingCanvas();
  const text = authoredText('A B CCCC', 18);
  paintSlideText(
    ctx,
    { ...text, paragraphs: text.paragraphs.map((p) => ({ ...p, align: 'justify' })) },
    60,
    200,
    { path: (d) => d },
  );
  expect(painted.filter((run) => run.text.trim()).map(({ text, x }) => [text, x])).toEqual([
    ['A', 0],
    ['B', 50],
    ['CCCC', 0],
  ]);
});
