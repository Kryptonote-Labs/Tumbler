import {
  applyPresentationCommand as run,
  createPresentation,
  backgroundPatterns,
  type BackgroundFill,
} from '../packages/slides/src/index.ts';
// Generated separately from the tests so XSD, SDK and Office consumers can inspect identical bytes.
const image =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAAlSURBVDiNY/xZLPafAQ+Q22SHT5qBCa8sEWDUgFEDRg0YLAYAAJC5A69cRdt4AAAAAElFTkSuQmCC';
const fills: BackgroundFill[] = [
  {
    kind: 'gradient',
    type: 'linear',
    angle: 45,
    stops: [
      { offset: 0, color: '#172554' },
      { offset: 0.4, color: '#7c3aed', opacity: 0.5 },
      { offset: 1, color: '#fbcfe8' },
    ],
  },
  {
    kind: 'gradient',
    type: 'radial',
    center: [0.5, 0.5],
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#172554' },
    ],
  },
  { kind: 'picture', data: image, contentType: 'image/png', opacity: 0.6, crop: [0.1, 0, 0.1, 0] },
  {
    kind: 'picture',
    data: image,
    contentType: 'image/png',
    tile: { scaleX: 20, scaleY: 20, flip: 'xy' },
  },
  ...backgroundPatterns.map((preset) => ({
    kind: 'pattern' as const,
    preset,
    foreground: '#172554',
    background: '#f8fafc',
  })),
];
let deck = createPresentation();
for (const [index, fill] of fills.entries()) {
  if (index) deck = run(deck, { name: 'insert-slide', index });
  const slideId = deck.document.slides[index]!.id;
  deck = run(deck, { name: 'set-background', slideId, fill });
}
const path = process.argv[2] ?? '/tmp/tumbler-backgrounds.pptx';
await Bun.write(path, deck.bytes());
console.log(`${path}: ${fills.length} native background fills`);
