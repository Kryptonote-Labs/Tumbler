import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as apply,
  createPresentation,
  importNativePresentation,
  validatePresentation,
  type PresentationArtifact,
  type PresentationCommand,
  type PresentationDocument,
} from '../src/index.ts';
import { createCanvas } from '@napi-rs/canvas';

const measurer = createCanvas(1, 1).getContext('2d');
/** Measures with the platform's default fonts; checks compare layouts, not exact glyph widths. */
function validatePresentationDocument(
  document: PresentationDocument,
  { slideId, reading }: { slideId?: string; reading?: boolean } = {},
) {
  return validatePresentation(document, { measurer, ...(reading ? { reading } : {}) }, slideId);
}

const text = (
  slideId: string,
  bounds: { x: number; y: number; width: number; height: number },
  value: string,
  style: { fontSize: number; textColor?: string; fontFamily?: string },
): PresentationCommand => ({
  name: 'insert-object',
  slideId,
  bounds,
  object: {
    kind: 'shape',
    fill: '#ffffff',
    geometry: 'rect',
    text: value,
    horizontalAlignment: 'start',
    verticalAlignment: 'top',
    ...style,
  },
});

function deck(build: (slideId: string) => PresentationCommand[]) {
  let artifact: PresentationArtifact = importNativePresentation(createPresentation());
  const slideId = artifact.document.slides[0]!.id;
  for (const key of artifact.document.slides[0]!.objects.map((object) => object.key))
    artifact = apply(artifact, { name: 'delete-object', slideId, objectKey: key });
  artifact = apply(artifact, {
    name: 'set-background',
    slideId,
    fill: { kind: 'solid', color: '#ffffff' },
  });
  for (const command of build(slideId)) artifact = apply(artifact, command);
  return artifact.document;
}

test('a slide built to the layout guidance has no warnings', () => {
  const document = deck((slideId) => [
    text(slideId, { x: 64, y: 72, width: 1100, height: 340 }, 'Support fades as skill grows', {
      fontSize: 72,
      textColor: '#1c1e24',
    }),
    text(
      slideId,
      { x: 64, y: 436, width: 1000, height: 220 },
      'Choose help for the task, then remove it once the learner can explain the work.',
      { fontSize: 32, textColor: '#1c1e24' },
    ),
  ]);
  expect(validatePresentationDocument(document).slides).toEqual([]);
});

test('measured layout problems are reported against their objects', () => {
  const document = deck((slideId) => [
    text(
      slideId,
      { x: 64, y: 56, width: 400, height: 60 },
      'A title that wraps onto several lines in a short box',
      { fontSize: 40, textColor: '#1c1e24' },
    ),
    text(slideId, { x: 8, y: 140, width: 600, height: 120 }, 'Tiny caption', {
      fontSize: 9,
      textColor: '#bbbbbb',
    }),
    text(slideId, { x: 64, y: 280, width: 1000, height: 40 }, 'Line one\vLine two', {
      fontSize: 24,
      textColor: '#1c1e24',
    }),
  ]);
  const [slide] = validatePresentationDocument(document).slides;
  const codes = slide!.warnings.map((warning) => warning.code);
  expect(codes).toEqual(
    expect.arrayContaining([
      'overflow',
      'margin',
      'small-text',
      'contrast',
      'manual-break',
      'empty-band',
    ]),
  );
  expect(
    slide!.warnings.every((warning) => warning.code === 'empty-band' || warning.objectKey),
  ).toBe(true);
});

test('small text in a large box is underfilled, and indented code keeps its lines', () => {
  const document = deck((slideId) => [
    text(
      slideId,
      { x: 64, y: 96, width: 560, height: 400 },
      'Lower setup barriers so learners can test ideas.',
      {
        fontSize: 16,
        textColor: '#1c1e24',
      },
    ),
    text(
      slideId,
      { x: 680, y: 96, width: 536, height: 120 },
      'for item in items:\v    print(item)',
      {
        fontSize: 20,
        textColor: '#1c1e24',
        fontFamily: 'IBM Plex Mono',
      },
    ),
  ]);
  const warnings = validatePresentationDocument(document).slides[0]!.warnings;
  const [prose, code] = document.slides[0]!.objects.map((object) => object.key);
  expect(warnings).toContainEqual(
    expect.objectContaining({ code: 'underfilled', objectKey: prose }),
  );
  expect(warnings).toContainEqual(
    expect.objectContaining({ code: 'small-text', objectKey: prose }),
  );
  expect(warnings.filter((warning) => warning.objectKey === code)).toEqual([]);
});

test('rows of small captions, mismatched siblings, collisions and gaps are flagged', () => {
  const ink = { textColor: '#1c1e24' };
  const document = deck((slideId) => [
    text(slideId, { x: 64, y: 64, width: 340, height: 60 }, 'Verify', { fontSize: 28, ...ink }),
    text(slideId, { x: 464, y: 64, width: 340, height: 60 }, 'Protect', { fontSize: 22, ...ink }),
    text(slideId, { x: 864, y: 64, width: 340, height: 60 }, 'Explain', { fontSize: 22, ...ink }),
    ...[64, 464, 864].map((x) =>
      text(slideId, { x, y: 130, width: 340, height: 40 }, 'Name the snag', {
        fontSize: 14,
        ...ink,
      }),
    ),
    {
      name: 'insert-object',
      slideId,
      bounds: { x: 440, y: 70, width: 40, height: 40 },
      object: { kind: 'shape', geometry: 'ellipse', fill: '#6d3ff0' },
    },
    text(
      slideId,
      { x: 64, y: 560, width: 1000, height: 80 },
      'Ask for a hint, then try the next step yourself',
      { fontSize: 28, ...ink },
    ),
  ]);
  const warnings = validatePresentationDocument(document).slides[0]!.warnings;
  const [verify, protect] = document.slides[0]!.objects.map((object) => object.key);
  expect(warnings).toContainEqual(
    expect.objectContaining({ code: 'inconsistent', objectKey: verify }),
  );
  expect(warnings).toContainEqual(
    expect.objectContaining({ code: 'collision', objectKey: protect }),
  );
  expect(warnings.filter((warning) => !warning.objectKey).map((warning) => warning.code)).toEqual(
    expect.arrayContaining(['small-text', 'empty-band']),
  );
});

test('centered free text among left-aligned text is flagged', () => {
  const ink = { textColor: '#1c1e24', fontSize: 24 };
  const document = deck((slideId) => [
    text(
      slideId,
      { x: 64, y: 160, width: 520, height: 200 },
      'Notice where you are stuck before asking',
      ink,
    ),
    {
      ...text(
        slideId,
        { x: 64, y: 400, width: 1152, height: 60 },
        'Learner does the thinking here',
        ink,
      ),
      object: {
        kind: 'shape',
        geometry: 'rect',
        text: 'Learner does the thinking here',
        horizontalAlignment: 'center',
        fill: '#ffffff',
        ...ink,
      },
    },
  ]);
  const centered = document.slides[0]!.objects[1]!.key;
  expect(validatePresentationDocument(document).slides[0]!.warnings).toContainEqual(
    expect.objectContaining({ code: 'alignment', objectKey: centered }),
  );
});

test('a mostly empty panel and a drifting title are flagged', () => {
  let artifact: PresentationArtifact = importNativePresentation(createPresentation());
  for (let index = 1; index < 4; index++)
    artifact = apply(artifact, { name: 'insert-slide', index });
  for (const [index, slide] of artifact.document.slides.entries()) {
    for (const key of slide.objects.map((object) => object.key))
      artifact = apply(artifact, { name: 'delete-object', slideId: slide.id, objectKey: key });
    artifact = apply(artifact, {
      name: 'set-background',
      slideId: slide.id,
      fill: { kind: 'solid', color: '#ffffff' },
    });
    const size = index === 3 ? 34 : 40;
    artifact = apply(
      artifact,
      text(slide.id, { x: 64, y: 56, width: 1152, height: 72 }, `Slide title ${index}`, {
        fontSize: size,
        textColor: '#1c1e24',
      }),
    );
  }
  const last = artifact.document.slides[3]!.id;
  artifact = apply(artifact, {
    name: 'insert-object',
    slideId: last,
    bounds: { x: 64, y: 180, width: 1152, height: 440 },
    object: { kind: 'shape', geometry: 'roundRect', fill: '#ecebf6' },
  });
  artifact = apply(
    artifact,
    text(last, { x: 96, y: 212, width: 400, height: 60 }, 'One short line of detail', {
      fontSize: 24,
      textColor: '#1c1e24',
    }),
  );
  const slides = validatePresentationDocument(artifact.document).slides;
  const codes = slides.flatMap((slide) =>
    slide.warnings.map((warning) => `${slide.number}:${warning.code}`),
  );
  expect(codes).toEqual(expect.arrayContaining(['4:title-drift', '4:empty-panel']));
  expect(codes.filter((code) => code.endsWith('title-drift'))).toEqual(['4:title-drift']);
});

test('three slides in a row with the same layout are flagged as repetition', () => {
  let artifact: PresentationArtifact = importNativePresentation(createPresentation());
  for (let index = 1; index < 3; index++)
    artifact = apply(artifact, { name: 'insert-slide', index });
  for (const slide of artifact.document.slides) {
    for (const key of slide.objects.map((object) => object.key))
      artifact = apply(artifact, { name: 'delete-object', slideId: slide.id, objectKey: key });
    artifact = apply(artifact, {
      name: 'set-background',
      slideId: slide.id,
      fill: { kind: 'solid', color: '#ffffff' },
    });
    artifact = apply(
      artifact,
      text(slide.id, { x: 64, y: 160, width: 520, height: 200 }, '40%', {
        fontSize: 120,
        textColor: '#1c1e24',
      }),
    );
    artifact = apply(
      artifact,
      text(
        slide.id,
        { x: 680, y: 200, width: 520, height: 200 },
        'Wholesale grew on three new grocery accounts',
        { fontSize: 24, textColor: '#1c1e24' },
      ),
    );
  }
  const slides = validatePresentationDocument(artifact.document).slides;
  const repeated = slides.filter((slide) =>
    slide.warnings.some((warning) => warning.code === 'repetition'),
  );
  expect(repeated.map((slide) => slide.number)).toEqual([3]);
});

test('a deck without enough icons, charts or pictures is asked for visuals', () => {
  const ring = { d: 'M0,0H10V10H0Z', width: 10, height: 10 };
  const build = (icons: number) => {
    let artifact: PresentationArtifact = importNativePresentation(createPresentation());
    for (let index = 1; index < 6; index++)
      artifact = apply(artifact, { name: 'insert-slide', index });
    artifact.document.slides.slice(0, icons).forEach((slide) => {
      artifact = apply(artifact, {
        name: 'insert-object',
        slideId: slide.id,
        bounds: { x: 900, y: 200, width: 96, height: 96 },
        object: { kind: 'shape', path: ring, fill: '#6d3ff0' },
      });
    });
    return validatePresentationDocument(artifact.document).slides.flatMap((slide) =>
      slide.warnings.filter((warning) => warning.code === 'visuals'),
    );
  };
  expect(build(0)).toHaveLength(1);
  expect(build(2)).toEqual([]);
});

test('tiled icons that lead their text pass; stray, bare and misaligned icons do not', () => {
  const glyph = { d: 'M0,0H10V10H0Z', width: 10, height: 10 };
  const ink = { textColor: '#1c1e24', fontSize: 28 };
  const icon = (slideId: string, x: number, y: number, size: number): PresentationCommand => ({
    name: 'insert-object',
    slideId,
    bounds: { x, y, width: size, height: size },
    object: { kind: 'shape', path: glyph, fill: '#6d3ff0' },
  });
  const tile = (slideId: string, x: number, y: number): PresentationCommand => ({
    name: 'insert-object',
    slideId,
    bounds: { x, y, width: 96, height: 96 },
    object: { kind: 'shape', geometry: 'ellipse', fill: '#ece9f6' },
  });
  const document = deck((slideId) => [
    ...[64, 464, 864].flatMap((x) => [
      tile(slideId, x, 160),
      icon(slideId, x + 24, 184, 48),
      text(slideId, { x: x - 7, y: 288, width: 340, height: 60 }, 'Focus timer', ink),
    ]),
    icon(slideId, 600, 520, 40),
    icon(slideId, 920, 520, 72),
    text(slideId, { x: 960, y: 610, width: 240, height: 60 }, 'Ships soon', ink),
  ]);
  const keys = document.slides[0]!.objects.map((object) => object.key);
  const flagged = validatePresentationDocument(document)
    .slides[0]!.warnings.filter((warning) => warning.code === 'icon')
    .map((warning) => keys.indexOf(warning.objectKey!));
  expect([...new Set(flagged)].sort((a, b) => a - b)).toEqual([9, 10]);
});

test('text is checked against both tones of a hard-edged gradient background', () => {
  const contrastFor = (x: number) => {
    let artifact: PresentationArtifact = importNativePresentation(createPresentation());
    const slideId = artifact.document.slides[0]!.id;
    for (const key of artifact.document.slides[0]!.objects.map((object) => object.key))
      artifact = apply(artifact, { name: 'delete-object', slideId, objectKey: key });
    // Left half dark, right half light, split vertically at the middle.
    artifact = apply(artifact, {
      name: 'set-background',
      slideId,
      fill: {
        kind: 'gradient',
        type: 'linear',
        angle: 0,
        stops: [
          { offset: 0, color: '#16112B' },
          { offset: 0.5, color: '#16112B' },
          { offset: 0.5, color: '#F7F6FB' },
          { offset: 1, color: '#F7F6FB' },
        ],
      },
    });
    artifact = apply(artifact, {
      name: 'insert-object',
      slideId,
      bounds: { x, y: 300, width: 400, height: 80 },
      object: { kind: 'shape', text: 'Light that follows you', fontSize: 28, textColor: '#FFFFFF' },
    });
    return validatePresentationDocument(artifact.document).slides.flatMap((slide) =>
      slide.warnings.filter((warning) => warning.code === 'contrast' || warning.code === 'cut'),
    );
  };
  expect(contrastFor(64)).toEqual([]);
  expect(
    contrastFor(440)
      .map((warning) => warning.code)
      .sort(),
  ).toEqual(['contrast', 'cut']);
});

test('wrapped titles and runs of hero slides are flagged', () => {
  let artifact: PresentationArtifact = importNativePresentation(createPresentation());
  for (let index = 1; index < 4; index++)
    artifact = apply(artifact, { name: 'insert-slide', index });
  artifact.document.slides.forEach((slide, index) => {
    for (const key of slide.objects.map((object) => object.key))
      artifact = apply(artifact, { name: 'delete-object', slideId: slide.id, objectKey: key });
    const title =
      index === 0 ? 'Take the model from two cities to four new markets' : `Slide ${index}`;
    artifact = apply(
      artifact,
      text(slide.id, { x: 64, y: 56, width: index === 0 ? 600 : 1152, height: 140 }, title, {
        fontSize: 40,
      }),
    );
    artifact = apply(
      artifact,
      text(slide.id, { x: 64 + index * 40, y: 220, width: 700, height: 300 }, `${index + 4}0%`, {
        fontSize: 120,
      }),
    );
  });
  const slides = validatePresentationDocument(artifact.document).slides;
  const codes = (number: number) =>
    slides.find((slide) => slide.number === number)?.warnings.map((warning) => warning.code) ?? [];
  expect(slides[0]!.warnings.find((warning) => warning.code === 'title-drift')?.message).toContain(
    'wraps',
  );
  expect(codes(3)).toContain('repetition');
});

test('a reading deck allows more words per slide than a live deck', () => {
  const sentence = 'Attention lets every token weigh every other token in one parallel step. ';
  const document = deck((slideId) => [
    text(slideId, { x: 64, y: 64, width: 1152, height: 592 }, sentence.repeat(5).trim(), {
      fontSize: 32,
      textColor: '#1c1e24',
    }),
  ]);
  const dense = (reading: boolean) =>
    validatePresentationDocument(document, { reading }).slides.flatMap((slide) =>
      slide.warnings.filter((warning) => warning.code === 'dense'),
    );
  expect(dense(false)).toHaveLength(1);
  expect(dense(true)).toEqual([]);
});

test('a paragraph left half-formatted after an edit is flagged', () => {
  const sentence = 'Attention connects every token in a sentence at once.';
  const mixed = (document: PresentationArtifact['document']) =>
    validatePresentationDocument(document).slides.flatMap((slide) =>
      slide.warnings.filter((warning) => warning.code === 'mixed-size'),
    );
  const even = deck((slideId) => [
    text(slideId, { x: 64, y: 160, width: 1000, height: 300 }, sentence, {
      fontSize: 32,
      textColor: '#1c1e24',
    }),
  ]);
  expect(mixed(even)).toEqual([]);
  const slide = even.slides[0]!;
  const partial = deck((slideId) => [
    text(slideId, { x: 64, y: 160, width: 1000, height: 300 }, sentence, {
      fontSize: 32,
      textColor: '#1c1e24',
    }),
    {
      name: 'format-text',
      slideId,
      objectKey: slide.objects[0]!.key,
      start: 0,
      end: 20,
      patch: { text: { fontSize: { set: 22 } } },
    },
  ]);
  expect(mixed(partial)).toHaveLength(1);
});
