import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
  PresentationEditingSession,
  presentationCommand,
  type BackgroundFill,
} from '../src/index.ts';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAAlSURBVDiNY/xZLPafAQ+Q22SHT5qBCa8sEWDUgFEDRg0YLAYAAJC5A69cRdt4AAAAAElFTkSuQmCC';
const fills: BackgroundFill[] = [
  { kind: 'solid', color: '#204060', opacity: 0.5 },
  {
    kind: 'gradient',
    type: 'linear',
    angle: 135,
    scaled: false,
    stops: [
      { offset: 1, color: '#ffffff' },
      { offset: 0, color: '#204060', opacity: 0.4 },
      { offset: 0.35, color: '#0088aa' },
    ],
  },
  {
    kind: 'gradient',
    type: 'radial',
    center: [0.25, 0.75],
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#000000' },
    ],
  },
  { kind: 'pattern', preset: 'diagCross', foreground: '#204060', background: '#ffffff' },
  {
    kind: 'picture',
    data: png,
    contentType: 'image/png',
    opacity: 0.6,
    crop: [0.1, 0.2, 0.3, 0.1],
  },
  {
    kind: 'picture',
    data: png,
    contentType: 'image/png',
    tile: { scaleX: 2, scaleY: 3, x: 5, y: 6, align: 'ctr', flip: 'xy' },
  },
];
function reopen(a: ReturnType<typeof createPresentation>) {
  return openPresentationArtifact(a.bytes());
}
for (const fill of fills)
  test(`native ${fill.kind} ${'type' in fill ? fill.type : 'tile' in fill && fill.tile ? 'tile' : ''} survives export, replacement and undo`, () => {
    let a = createPresentation();
    const slideId = a.document.slides[0]!.id;
    a = run(a, { name: 'insert-slide', index: 1 });
    const original = a.document.package;
    const session = new PresentationEditingSession(a);
    const next = session.execute({ name: 'set-background', slideId, fill });
    const slide = reopen(next).document.slides[0]!;
    expect(slide.objects).toEqual(a.document.slides[0]!.objects);
    if (fill.kind === 'gradient') {
      expect(slide.backgroundGradient).toMatchObject({
        kind: fill.type === 'linear' ? 'linear' : 'radial',
        stops: expect.arrayContaining([
          { offset: 1, color: fill.type === 'linear' ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)' },
        ]),
      });
      if (fill.type === 'radial') expect(slide.backgroundGradient!.center).toEqual(fill.center!);
    } else if (fill.kind === 'pattern')
      expect(slide.backgroundPattern).toMatchObject({
        preset: fill.preset,
        foreground: 'rgba(32,64,96,1)',
      });
    else if (fill.kind === 'picture') {
      expect(slide.backgroundPicture!.bytes).toEqual(
        Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
      );
      expect(slide.backgroundPicture!.opacity).toBe(fill.opacity ?? 1);
      if (fill.tile) expect(slide.backgroundPicture!.tile).toMatchObject(fill.tile);
      else expect(slide.backgroundPicture!.crop).toEqual(fill.crop!);
    } else expect(slide.background).toBe('rgba(32,64,96,0.5)');
    for (const part of original.parts)
      if (part.name.value !== a.document.slides[0]!.part && !part.name.value.endsWith('.rels'))
        expect(next.document.package.readPart(next.document.package.getPart(part.name)!)).toEqual(
          original.readPart(part),
        );
    expect(session.undo().bytes()).toEqual(a.bytes());
    expect(reopen(session.redo()).document.slides[0]).toEqual(slide);
    const solid = run(next, { name: 'background', slideId, color: '#ff0000' }).document.slides[0]!;
    expect(solid.backgroundGradient).toBeUndefined();
    expect(solid.backgroundPicture).toBeUndefined();
    expect(solid.backgroundPattern).toBeUndefined();
  });
test('reset removes local background and restores the layout background', () => {
  const a = createPresentation(),
    pkg = a.document.package;
  const layout = pkg.parts.find(
    (p) => p.name.value.includes('slideLayouts/') && p.name.value.endsWith('.xml'),
  )!;
  const xml = new TextDecoder()
    .decode(pkg.readPart(layout))
    .replace(
      /<p:cSld[^>]*>/,
      '$&<p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
    );
  const inherited = openPresentationArtifact(
    beginPackageTransaction(pkg)
      .replacePart(layout.name.value, new TextEncoder().encode(xml))
      .commit(),
  );
  const slideId = inherited.document.slides[0]!.id;
  expect(inherited.document.slides[0]!.background).toBe('rgba(17,34,51,1)');
  const changed = run(inherited, { name: 'set-background', slideId, fill: fills[1]! });
  const reset = reopen(
    run(changed, { name: 'set-background', slideId, fill: { kind: 'inherit' } }),
  );
  expect(reset.document.slides[0]!.background).toBe('rgba(17,34,51,1)');
  expect(reset.document.slides[0]!.backgroundGradient).toBeUndefined();
});
test('apply to all is one undoable batch and pictures retain separate valid relationships', () => {
  let a = createPresentation();
  a = run(a, { name: 'insert-slide', index: 1 });
  const session = new PresentationEditingSession(a);
  const next = session.execute({
    name: 'batch',
    commands: a.document.slides.map((s) => ({
      name: 'set-background',
      slideId: s.id,
      fill: fills[4]!,
    })),
  });
  expect(reopen(next).document.slides.every((s) => s.backgroundPicture?.opacity === 0.6)).toBe(
    true,
  );
  expect(session.undo().bytes()).toEqual(a.bytes());
});
test('invalid stop positions, crops, colours, pattern presets and image signatures fail without changing the deck', () => {
  const a = createPresentation(),
    slideId = a.document.slides[0]!.id,
    bytes = a.bytes();
  for (const fill of [
    {
      ...fills[1],
      stops: [
        { offset: 2, color: '#ffffff' },
        { offset: 0, color: '#000000' },
      ],
    },
    { kind: 'picture', data: png, contentType: 'image/png', crop: [0.7, 0, 0.5, 0] },
    { kind: 'solid', color: 'red' },
    { kind: 'pattern', preset: 'made-up', foreground: '#000000', background: '#ffffff' },
  ])
    expect(presentationCommand.safeParse({ name: 'set-background', slideId, fill }).success).toBe(
      false,
    );
  expect(() =>
    run(a, {
      name: 'set-background',
      slideId,
      fill: { kind: 'picture', data: png, contentType: 'image/jpeg' },
    }),
  ).toThrow('content type');
  expect(a.bytes()).toEqual(bytes);
});

test('picture adjustments and apply-to-all reuse embedded media instead of growing the package', () => {
  let a = createPresentation();
  a = run(a, { name: 'insert-slide', index: 1 });
  for (const s of a.document.slides)
    for (const opacity of [0.2, 0.4, 0.6])
      a = run(a, {
        name: 'set-background',
        slideId: s.id,
        fill: { kind: 'picture', data: png, contentType: 'image/png', opacity },
      });
  const saved = reopen(a);
  expect(saved.document.package.parts.filter((p) => p.contentType === 'image/png')).toHaveLength(1);
  for (const slide of saved.document.slides)
    expect(
      saved.document.package
        .relationships(saved.document.package.getPart(slide.part)!.name)
        .items.filter((r) => r.type.endsWith('/image')),
    ).toHaveLength(1);
});
