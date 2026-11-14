import { expect, test } from 'bun:test';
import { normalizeSlideTransition, slideTransitionKinds } from '@tumblerjs/slides';
import { presentationTransitionFrame } from './presentation-transition-effects.ts';
import { presentationAdvanceDelay } from './presentation-advance.ts';

test('every authored transition renders finite intermediate frames and finishes on the next slide', () => {
  for (const kind of slideTransitionKinds) {
    const transition = normalizeSlideTransition({ kind });
    for (const p of [0, .2, .5, .8, 1]) {
      const frame = presentationTransitionFrame(transition, p);
      expect(JSON.stringify(frame)).not.toMatch(/NaN|Infinity|undefined/);
      if (p === 1) {
        expect(frame.incoming).toEqual({});
        expect(frame.outgoing.opacity).toBe(0);
        expect(frame.pieces).toBeUndefined();
      }
    }
  }
});
test('push moves both slides; cover moves only the incoming slide; uncover moves only the outgoing slide', () => {
  const atHalf = (kind: 'push' | 'cover' | 'pull') => presentationTransitionFrame(normalizeSlideTransition({ kind, direction: 'l' }), .5);
  expect(atHalf('push').incoming.transform).toBe('translate(50%, 0%)');
  expect(atHalf('push').outgoing.transform).toBe('translate(-50%, 0%)');
  expect(atHalf('cover').outgoing.transform).toBeUndefined();
  expect(atHalf('pull').incoming.transform).toBeUndefined();
  expect(atHalf('pull').front).toBe('outgoing');
});
test('through-black fades both slides to black halfway, rather than crossfading', () => {
  const effect = normalizeSlideTransition({ kind: 'fade', throughBlack: true });
  const middle = presentationTransitionFrame(effect, .5);
  expect(middle.incoming.opacity).toBe(0);
  expect(middle.outgoing.opacity).toBe(0);
  expect(middle.background).toBe('#000');
});
test('unknown imported effects cut without invoking an unrelated animation', () => {
  const frame = presentationTransitionFrame({ kind: 'morph', direction: 'l', duration: 1000, advanceOnClick: true }, .5);
  expect(frame.incoming).toEqual({});
  expect(frame.outgoing.opacity).toBe(0);
});
test('random effects and fragment paths are deterministic across replays', () => {
  const effect = normalizeSlideTransition({ kind: 'random' });
  expect(presentationTransitionFrame(effect, .3, 42)).toEqual(presentationTransitionFrame(effect, .3, 42));
  const fracture = presentationTransitionFrame(normalizeSlideTransition({ kind: 'fracture' }), .4);
  expect(fracture.pieces?.length).toBe(24);
  expect(new Set(fracture.pieces?.map(p => p.clip)).size).toBe(24);
});
test('automatic advance waits for the final click group, its effects, and the authored slide delay', () => {
  const slide = {
    transition: normalizeSlideTransition({ kind: 'fade', advanceAfter: 2000 }),
    animations: [{ kind: 'fade' as const, entrance: true, target: '1', step: 1, delay: 100, duration: 400, direction: 'left' }],
  };
  expect(presentationAdvanceDelay(slide, 0)).toBeUndefined();
  expect(presentationAdvanceDelay(slide, 1)).toBe(2500);
  expect(presentationAdvanceDelay({ ...slide, animations: [] }, 0, 800)).toBe(2800);
  expect(presentationAdvanceDelay({ transition: normalizeSlideTransition({ kind: 'cut', advanceAfter: 0 }) }, 0)).toBe(0);
  expect(presentationAdvanceDelay({}, 0)).toBeUndefined();
});
test('preset inversion reflects motion without mirroring slide content', () => {
  const regular = presentationTransitionFrame(normalizeSlideTransition({ kind: 'fallOver' }), .5);
  const reflected = presentationTransitionFrame(normalizeSlideTransition({ kind: 'fallOver', invertY: true }), .5);
  expect(regular.outgoing.origin).toBe('center bottom');
  expect(reflected.outgoing.origin).toBe('center top');
  expect(reflected.outgoing.transform).toContain('scale(1, -1)');
  const curtains = presentationTransitionFrame(normalizeSlideTransition({ kind: 'curtains', invertX: true }), .5);
  expect(curtains.pieces?.[0]?.reflection).toBe('translate(1 0) scale(-1 1)');
});
