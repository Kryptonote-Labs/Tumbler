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
  const options = { slide, playing: true, editable: false, step: 0, width: 1280, height: 720 };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, options);
  expect(target.style.visibility).toBe('hidden');
  playback.update({ ...options, step: 1 });
  expect(target.style.visibility).toBe('visible');
  expect(target.style.opacity).not.toBe('');
  playback.update({ ...options, playing: false });
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
  const options = { slide, playing: false, editable: true, step: 0, width: 1280, height: 720 };
  const playback = presentationPlayback(node as unknown as SVGSVGElement, options);
  expect(node.querySelector('g')!.style.opacity).toBe('');
  playback.update({ ...options, preview: { version: 1 } });
  expect(node.querySelector('g')!.style.opacity).not.toBe('');
  expect(JSON.stringify(slide)).toBe(before);
  playback.destroy();
  window.happyDOM.abort();
});
