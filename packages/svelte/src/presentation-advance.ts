import type { PresentationSlide } from '@tumblerjs/slides';
/** PowerPoint starts advTm after the final animation. Unplayed click groups still need their clicks. */
export function presentationAdvanceDelay(slide: Pick<PresentationSlide, 'transition' | 'animations'>, step: number, transitionRemaining = 0) {
  const after = slide.transition?.advanceAfter;
  if (after === undefined || (slide.animations ?? []).some(effect => effect.step > step)) return;
  const animationEnd = Math.max(0, ...(slide.animations ?? []).filter(effect => effect.step === step).map(effect => effect.delay + effect.duration));
  return transitionRemaining + animationEnd + after;
}
interface AdvanceOptions {
  slide: PresentationSlide;
  step: number;
  playing: boolean;
  editable: boolean;
  transitionRemaining: () => number;
  onadvance?: (() => void) | undefined;
}
/** Timers are tied to one slide/group and split long OOXML delays at the browser's signed-int boundary. */
export function presentationAdvance(node: SVGSVGElement, initial: AdvanceOptions) {
  const view = node.ownerDocument.defaultView!;
  let timer = 0, identity = '', callback: (() => void) | undefined;
  function stop() { view.clearTimeout(timer); }
  function update(options: AdvanceOptions) {
    callback = options.onadvance;
    const key = options.playing && !options.editable && callback
      ? `${options.slide.part}:${options.step}:${options.slide.transition?.advanceAfter}:${JSON.stringify(options.slide.animations)}` : '';
    if (key === identity) return;
    identity = key;
    stop();
    if (!key) return;
    const delay = presentationAdvanceDelay(options.slide, options.step, options.transitionRemaining());
    if (delay === undefined) return;
    const deadline = view.performance.now() + delay;
    function tick() {
      const remaining = deadline - view.performance.now();
      if (remaining > 0) timer = view.setTimeout(tick, Math.min(remaining, 2147483647));
      else callback?.();
    }
    timer = view.setTimeout(tick, Math.min(delay, 2147483647));
  }
  update(initial);
  return { update, destroy: stop };
}
