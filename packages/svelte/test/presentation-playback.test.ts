import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  createPresentation,
  applyPresentationCommand,
  normalizeEntranceAnimation,
} from '@tumblerjs/slides';
import {
  nextPresentationAnimationStep,
  presentationPlayback,
} from '../src/presentation-playback.ts';
function fixture() {
  let artifact = createPresentation();
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, {
    name: 'insert-object',
    slideId,
    bounds: { x: 100, y: 100, width: 100, height: 100 },
    object: { kind: 'shape', geometry: 'rect' },
  });
  artifact = applyPresentationCommand(artifact, {
    name: 'add-animation',
    slideId,
    objectKey: artifact.document.slides[0]!.objects[0]!.key,
    animation: normalizeEntranceAnimation({ kind: 'fade' }),
  });
  return artifact.document.slides[0]!;
}
test('advance consumes animation click groups then yields navigation', () => {
  const slide = fixture();
  expect(nextPresentationAnimationStep(slide, 0)).toBe(1);
  expect(nextPresentationAnimationStep(slide, 1)).toBeUndefined();
  expect(nextPresentationAnimationStep({}, 0)).toBeUndefined();
});
test('real SVG playback initializes entrances and restores transforms and styles on exit', () => {
  const window = new Window(),
    slide = fixture();
  const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.innerHTML = `<g transform="matrix(1 0 0 1 100 100)" data-animation-target="${slide.objects[0]!.shapeId}"><rect width="100" height="100"/></g>`;
  window.document.body.append(node);
  const target = node.querySelector('g')!;
  const options = { slide, mode: 'slideshow' as const, step: 0, width: 1280, height: 720 };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, options);
  expect(target.style.visibility).toBe('hidden');
  playback.update({ ...options, step: 1 });
  expect(target.style.visibility).toBe('visible');
  expect(target.style.opacity).not.toBe('');
  playback.update({ ...options, mode: 'static' });
  expect(target.getAttribute('transform')).toBe('matrix(1 0 0 1 100 100)');
  expect(target.style.visibility).toBe('');
  expect(target.style.opacity).toBe('');
  playback.destroy();
  window.happyDOM.abort();
});
test('editing is static and preview is isolated from persisted slide state', () => {
  const window = new Window(),
    slide = fixture(),
    before = JSON.stringify(slide);
  const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.innerHTML = `<g data-animation-target="${slide.objects[0]!.shapeId}" transform="matrix(1 0 0 1 100 100)"/>`;
  const options = { slide, mode: 'static' as const, width: 1280, height: 720 };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, options);
  expect(node.querySelector('g')!.style.opacity).toBe('');
  playback.update({ ...options, mode: 'preview', preview: { version: 1 } });
  expect(node.querySelector('g')!.style.opacity).not.toBe('');
  expect(JSON.stringify(slide)).toBe(before);
  playback.destroy();
  window.happyDOM.abort();
});

test('entering a slideshow after preview waits for its click groups instead of replaying the preview', () => {
  const window = new Window(),
    slide = fixture();
  const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.innerHTML = `<g data-animation-target="${slide.objects[0]!.shapeId}" transform="matrix(1 0 0 1 100 100)"/>`;
  const preview = { id: slide.animations![0]!.id!, version: 1 };
  const options = { slide, width: 1280, height: 720, mode: 'preview' as const, preview };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, options);
  playback.update({ slide, width: 1280, height: 720, mode: 'slideshow', step: 0 });
  expect(node.querySelector('g')!.style.visibility).toBe('hidden');
  playback.update({ slide, width: 1280, height: 720, mode: 'slideshow', step: 1 });
  expect(node.querySelector('g')!.style.visibility).toBe('visible');
  playback.destroy();
  window.happyDOM.abort();
});

test('two on-click entrances play once each after preview and leave no third click group', () => {
  const window = new Window();
  let artifact = createPresentation();
  const slideId = artifact.document.slides[0]!.id;
  for (const [index, kind] of ['zoom', 'fade'].entries()) {
    artifact = applyPresentationCommand(artifact, {
      name: 'insert-object',
      slideId,
      bounds: { x: 100 + index * 200, y: 100, width: 100, height: 100 },
      object: { kind: 'shape', geometry: 'rect' },
    });
    artifact = applyPresentationCommand(artifact, {
      name: 'add-animation',
      slideId,
      objectKey: artifact.document.slides[0]!.objects.at(-1)!.key,
      animation: normalizeEntranceAnimation({ kind: kind === 'zoom' ? 'zoom' : 'fade' }),
    });
  }
  const slide = artifact.document.slides[0]!;
  const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.innerHTML = slide.objects
    .map(
      (object) =>
        `<g data-animation-target="${object.shapeId}" transform="matrix(${object.matrix.join(' ')})"/>`,
    )
    .join('');
  const targets = node.querySelectorAll('g');
  const geometry = { slide, width: 1280, height: 720 };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, {
    ...geometry,
    mode: 'preview',
    preview: { id: slide.animations![0]!.id!, version: 1 },
  });
  playback.update({ ...geometry, mode: 'slideshow', step: 0 });
  expect([...targets].map((target) => target.style.visibility)).toEqual(['hidden', 'hidden']);
  playback.update({ ...geometry, mode: 'slideshow', step: 1 });
  expect([...targets].map((target) => target.style.visibility)).toEqual(['visible', 'hidden']);
  playback.update({ ...geometry, mode: 'slideshow', step: 2 });
  expect([...targets].map((target) => target.style.visibility)).toEqual(['visible', 'visible']);
  expect(targets[0]!.getAttribute('transform')).toBe(
    `matrix(${slide.objects[0]!.matrix.join(' ')})`,
  );
  expect(nextPresentationAnimationStep(slide, 2)).toBeUndefined();
  playback.destroy();
  window.happyDOM.abort();
});
