import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { normalizeSlideTransition, type PresentationSlide } from '@tumblerjs/slides';
import { createPresentationTransitionPlayer } from './presentation-transition-player.ts';
import { presentationImageUrl } from './presentation-image-url.ts';
function stage() {
  const window = new Window();
  let time = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  Object.defineProperty(window.performance, 'now', { value: () => time });
  Object.defineProperty(window, 'requestAnimationFrame', { value: (cb: FrameRequestCallback) => { callbacks.set(++id, cb); return id; } });
  Object.defineProperty(window, 'cancelAnimationFrame', { value: (id: number) => { callbacks.delete(id); } });
  window.document.body.innerHTML = '<div><svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><rect id="old" fill="url(#paint)" width="800" height="450"/></svg></div>';
  const node = window.document.querySelector('svg')! as unknown as SVGSVGElement;
  const frame = node.parentElement!;
  const player = createPresentationTransitionPlayer();
  const slide = (part: string, kind: 'push' | 'fracture' | 'fade' = 'push') => ({ part, transition: normalizeSlideTransition({ kind, duration: 1000 }) }) as PresentationSlide;
  const options = (part: string, kind?: 'push' | 'fracture' | 'fade') => ({ slide: slide(part, kind), playing: true, editable: false });
  const action = player.action(node, options('old'));
  function change(part = 'next', kind: 'push' | 'fracture' | 'fade' = 'push') {
    player.capture(node, part);
    node.querySelector('rect')!.id = 'new';
    action.update(options(part, kind));
  }
  function advance(ms: number) {
    time += ms;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(cb => cb(time));
  }
  return { window, frame, node, player, action, change, advance, options, callbacks };
}
test('slide changes retain an inaccessible outgoing slide with independent SVG definitions, then clean up', () => {
  const s = stage();
  s.change();
  const old = s.frame.querySelector('svg[aria-hidden="true"]')!;
  expect(old).not.toBeNull();
  expect(old.querySelector('rect')!.id).not.toBe('old');
  expect(old.querySelector('rect')!.getAttribute('fill')).toBe(`url(#${old.querySelector('linearGradient')!.id})`);
  expect(s.node.style.transform).toBe('translate(100%, 0%)');
  s.advance(500);
  expect(s.node.style.transform).toBe('translate(50%, 0%)');
  s.advance(500);
  expect(s.frame.querySelectorAll('svg')).toHaveLength(1);
  expect(s.node.style.transform).toBe('');
  expect(s.node.querySelectorAll('clipPath')).toHaveLength(0);
  s.action.destroy();
});
test('rapid navigation and leaving playback remove overlays, frames, and styles', () => {
  const s = stage();
  s.change('second', 'fracture');
  expect(s.frame.querySelectorAll(':scope > svg')).toHaveLength(26);
  s.advance(100);
  s.change('third');
  expect(s.frame.querySelectorAll(':scope > svg')).toHaveLength(2);
  s.action.update({ ...s.options('third'), playing: false });
  expect(s.frame.querySelectorAll(':scope > svg')).toHaveLength(1);
  expect(s.callbacks.size).toBe(0);
  expect(s.node.getAttribute('style')).toBeNull();
  s.action.destroy();
});
test('reduced motion skips transitions and static slide navigation never creates overlays', () => {
  const s = stage();
  s.action.update({ ...s.options('old'), playing: false });
  s.change();
  expect(s.frame.querySelectorAll('svg')).toHaveLength(1);
  s.action.destroy();
  const next = stage();
  next.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as ReturnType<Window['matchMedia']>;
  // Recreate the action so it observes the media query at mount.
  next.action.destroy();
  const player = createPresentationTransitionPlayer();
  const action = player.action(next.node, next.options('old'));
  player.capture(next.node, 'next');
  action.update(next.options('next'));
  expect(next.frame.querySelectorAll('svg')).toHaveLength(1);
  action.destroy();
});
test('snapshot holds outgoing image resources until cleanup', () => {
  const s = stage();
  const resource = presentationImageUrl(new Uint8Array([1, 2]), 'image/png');
  const image = s.node.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.setAttribute('href', resource.url); s.node.append(image);
  s.change('next', 'fade');
  resource.release();
  expect(s.frame.querySelector('svg[aria-hidden="true"] image')?.getAttribute('href')).toBe(resource.url);
  s.action.destroy();
});
