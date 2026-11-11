import { expect, test } from 'bun:test';
import { createCanvas, loadImage, Path2D } from '@napi-rs/canvas';
import { createPresentation, applyPresentationCommand, createPresentationNativeView, openPresentationNativeArchive, presentationSlideImages, paintPresentationSlide } from '../src/index.ts';
import { slideObjectViewport } from '../src/canvas-gradient.ts';
import type { DrawingGradient } from '@tumblerjs/ooxml';

const gradient: DrawingGradient = { kind: 'linear', angle: 0, scaled: false, center: [.5, .5], tileRect: [0, 0, .5, 1], stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }] };

test('compiled slide image collection needs the viewport dimensions without export preservation', () => {
  const partial = openPresentationNativeArchive(createPresentationNativeView(createPresentation()));
  const document = partial.document, slide = document.slides[0]!;
  expect(() => document.package).toThrow('Presentation preservation resources have not loaded.');
  expect(presentationSlideImages(slide, document)).toEqual([]);
  const images = presentationSlideImages({ ...slide, backgroundGradient: gradient }, document);
  expect(images).toHaveLength(1);
  expect(images[0]!.bytes.length).toBeGreaterThan(0);
});

test('native tiled slide backgrounds use the same brush as visible shapes', async () => {
  const document = { ...createPresentation().document, width: 100, height: 80 };
  const slide = { ...document.slides[0]!, backgroundGradient: gradient };
  const pictures = presentationSlideImages(slide, document);
  expect(pictures).toHaveLength(1);
  const images = new Map(await Promise.all(pictures.map(async picture => { const image = await loadImage(Buffer.from(picture.bytes)); return [picture, { image, width: image.width, height: image.height }] as const; })));
  const canvas = createCanvas(100, 80), context = canvas.getContext('2d');
  paintPresentationSlide(context, document, slide, { path: d => new Path2D(d), image: picture => images.get(picture) });
  const first = context.getImageData(10, 40, 1, 1).data, reflected = context.getImageData(89, 40, 1, 1).data;
  expect([...first]).toEqual([...reflected]);
  expect(first[0]).toBeGreaterThan(first[2]!);
  expect(context.getImageData(49, 40, 1, 1).data[2]).toBeGreaterThan(250);
});

test('large native gradient shapes allocate only their visible slide area', async () => {
  let artifact = createPresentation();
  artifact = applyPresentationCommand(artifact, { name: 'insert-object', slideId: artifact.document.slides[0]!.id, bounds: { x: -50000, y: -50000, width: 100000, height: 100000 }, object: { kind: 'shape', geometry: 'rect', fill: '#FF0000' } });
  const document = { ...artifact.document, width: 200, height: 120 }, current = document.slides[0]!;
  const slide = { ...current, objects: current.objects.map(object => ({ ...object, gradient: { ...gradient, kind: 'rectangular' as const, path: 'rect' as const } })) };
  const pictures = presentationSlideImages(slide, document);
  expect(pictures).toHaveLength(1);
  const image = await loadImage(Buffer.from(pictures[0]!.bytes));
  expect(image.width).toBeLessThanOrEqual(256); expect(image.height).toBeLessThanOrEqual(256);
  const hidden = { ...slide, objects: slide.objects.map(object => ({ ...object, matrix: [1, 0, 0, 1, 1000, 1000] as const })) };
  expect(presentationSlideImages(hidden, document)).toHaveLength(0);
});

test('shape-local brush coverage follows rotated, flipped and translated objects', () => {
  expect(slideObjectViewport([0, 1, -1, 0, 100, -50], 100000, 100000, { width: 200, height: 120 })).toEqual({ x: 50, y: 0, width: 120, height: 100 });
  expect(slideObjectViewport([-1, 0, 0, 1, 300, -40], 100000, 100000, { width: 200, height: 120 })).toEqual({ x: 100, y: 40, width: 200, height: 120 });
});


test('small reflected gradient tiles retain their frequency at higher output scale', async () => {
  const document = { ...createPresentation().document, width: 100, height: 80 };
  const slide = { ...document.slides[0]!, backgroundGradient: { ...gradient, tileRect: [0, 0, .01, 1] as const } };
  const pictures = presentationSlideImages(slide, document, 2);
  const images = new Map(await Promise.all(pictures.map(async picture => { const image = await loadImage(Buffer.from(picture.bytes)); return [picture, { image, width: image.width, height: image.height }] as const; })));
  const canvas = createCanvas(200, 160), context = canvas.getContext('2d');
  paintPresentationSlide(context, document, slide, { scale: 2, path: d => new Path2D(d), image: picture => images.get(picture) });
  const left = context.getImageData(0, 80, 1, 1).data, right = context.getImageData(1, 80, 1, 1).data;
  expect(left[0]! - left[2]!).toBeGreaterThan(80);
  expect(right[2]! - right[0]!).toBeGreaterThan(80);
  expect([...context.getImageData(2, 80, 1, 1).data]).toEqual([...right]);
});

test('scaled groups sample untiled brushes at output size rather than local model size', async () => {
  let artifact = createPresentation();
  artifact = applyPresentationCommand(artifact, { name: 'insert-object', slideId: artifact.document.slides[0]!.id, bounds: { x: 0, y: 0, width: 100000, height: 100000 }, object: { kind: 'shape', geometry: 'rect', fill: '#FF0000' } });
  const document = { ...artifact.document, width: 200, height: 120 }, current = document.slides[0]!;
  const { tileRect, ...untiled } = gradient;
  const slide = { ...current, objects: current.objects.map(object => ({ ...object, matrix: [.001, 0, 0, .001, 0, 0] as const, gradient: { ...untiled, kind: 'rectangular' as const, path: 'rect' as const } })) };
  const pictures = presentationSlideImages(slide, document);
  expect(pictures).toHaveLength(1);
  const image = await loadImage(Buffer.from(pictures[0]!.bytes));
  expect(image.width).toBe(100); expect(image.height).toBe(100);
});
