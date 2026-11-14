import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { normalizeSlideTransition, type PresentationSlide } from '@tumblerjs/slides';
import { presentationAdvance } from './presentation-advance.ts';
function clock() {
  const window = new Window();
  const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  Object.defineProperty(window.performance, 'now', { value: () => now });
  Object.defineProperty(window, 'setTimeout', { value: (callback: () => void, delay: number) => { timers.set(++id, { at: now + delay, callback }); return id; } });
  Object.defineProperty(window, 'clearTimeout', { value: (id: number) => timers.delete(id) });
  return { node, timers, advance(ms: number) {
    now += ms;
    for (const [key, value] of [...timers]) if (value.at <= now) { timers.delete(key); value.callback(); }
  } };
}
function slide(delay: number, part = 'one') {
  return { part, transition: normalizeSlideTransition({ kind: 'fade', advanceAfter: delay }) } as PresentationSlide;
}
test('advance timers fire once, retain their deadline across redraws, and cancel on stop or navigation', () => {
  const c = clock(); let advances = 0;
  const options = { slide: slide(1000), step: 0, playing: true, editable: false, transitionRemaining: () => 0, onadvance: () => advances++ };
  const action = presentationAdvance(c.node, options);
  c.advance(600);
  action.update({ ...options });
  c.advance(400);
  expect(advances).toBe(1);
  c.advance(1000);
  expect(advances).toBe(1);
  action.update({ ...options, slide: slide(1000, 'two') });
  action.update({ ...options, playing: false });
  expect(c.timers.size).toBe(0);
  action.update({ ...options, slide: slide(1000, 'three') });
  action.destroy();
  c.advance(1000);
  expect(advances).toBe(1);
});
test('long OOXML advance times are split at the signed browser timer boundary without early advancement', () => {
  const c = clock(); let advances = 0;
  const action = presentationAdvance(c.node, { slide: slide(4294967295), step: 0, playing: true, editable: false, transitionRemaining: () => 0, onadvance: () => advances++ });
  expect([...c.timers.values()][0]?.at).toBe(2147483647);
  c.advance(2147483647);
  expect(advances).toBe(0);
  c.advance(2147483647);
  expect(advances).toBe(0);
  c.advance(1);
  expect(advances).toBe(1);
  action.destroy();
});
