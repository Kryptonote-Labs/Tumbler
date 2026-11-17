import { createPresentationAnimationPlayer, type PresentationSlide } from '@tumblerjs/slides';
/** Playback modes are exclusive: an editor preview cannot override a slideshow's timeline. */
export type PlaybackOptions = {
  slide: PresentationSlide;
  width: number;
  height: number;
} & (
  | { mode: 'static' }
  | { mode: 'slideshow'; step: number; entryDelay?: number }
  | { mode: 'preview'; preview: { id?: string; version: number } }
);
export function nextPresentationAnimationStep(
  slide: Pick<PresentationSlide, 'animations'>,
  step: number,
) {
  const next = Math.min(
    ...(slide.animations ?? []).filter((cue) => cue.step > step).map((cue) => cue.step),
  );
  return Number.isFinite(next) ? next : undefined;
}
/** A single clock applies headless frames. Targets and geometry are indexed once, never read per frame. */
export function presentationPlayback(node: SVGSVGElement, initial: PlaybackOptions) {
  const view = node.ownerDocument.defaultView!;
  let options = initial,
    previous: PlaybackOptions | undefined,
    raf = 0,
    completedPreview = -1;
  let player: ReturnType<typeof createPresentationAnimationPlayer> | undefined;
  const targets = new Map<
    string,
    {
      element: SVGElement;
      transform: string | null;
      style: string;
      lastTransform?: string;
      lastOpacity?: number;
      lastVisible?: boolean;
      lastClip?: string;
    }
  >();
  function clear() {
    view.cancelAnimationFrame(raf);
    raf = 0;
    for (const { element, transform } of targets.values()) {
      if (transform === null) element.removeAttribute('transform');
      else element.setAttribute('transform', transform);
      element.style.cssText = targets.get(element.dataset.animationTarget ?? '')?.style ?? '';
    }
    targets.clear();
    player = undefined;
  }
  function paint(now: number) {
    raf = 0;
    if (!player) return;
    for (const frame of player.sample(now)) {
      const target = targets.get(frame.target);
      if (!target) continue;
      const transform = `matrix(${frame.matrix.join(' ')})`;
      if (target.lastTransform !== transform) {
        target.element.setAttribute('transform', transform);
        target.lastTransform = transform;
      }
      if (target.lastOpacity !== frame.opacity) {
        target.element.style.opacity = String(frame.opacity);
        target.lastOpacity = frame.opacity;
      }
      if (target.lastVisible !== frame.visible) {
        target.element.style.visibility = frame.visible ? 'visible' : 'hidden';
        target.lastVisible = frame.visible;
      }
      if (target.lastClip !== frame.clip) {
        if (frame.clip) target.element.style.clipPath = frame.clip;
        else target.element.style.removeProperty('clip-path');
        target.lastClip = frame.clip;
      }
    }
    if (player.running) raf = view.requestAnimationFrame(paint);
    else if (options.mode === 'preview') {
      completedPreview = options.preview.version;
      clear();
    }
  }
  function update(next: PlaybackOptions) {
    options = next;
    const enabled =
      next.mode === 'slideshow' ||
      (next.mode === 'preview' && next.preview.version !== completedPreview);
    const changed =
      !previous ||
      previous.slide !== next.slide ||
      previous.mode !== next.mode ||
      (previous.mode === 'preview' &&
        next.mode === 'preview' &&
        previous.preview !== next.preview) ||
      (previous.mode === 'slideshow' && next.mode === 'slideshow' && next.step < previous.step);
    if (!enabled) {
      clear();
      previous = next;
      return;
    }
    if (changed || !player) {
      clear();
      for (const element of node.querySelectorAll<SVGElement>('[data-animation-target]')) {
        const id = element.dataset.animationTarget;
        if (id)
          targets.set(id, {
            element,
            transform: element.getAttribute('transform'),
            style: element.style.cssText,
          });
      }
      const slide =
        next.mode === 'preview'
          ? {
              ...next.slide,
              animations: (next.slide.animations ?? [])
                .filter((cue) => !next.preview.id || cue.id === next.preview.id)
                .map((cue) => ({ ...cue, step: 0, delay: cue.startDelay ?? 0 })),
            }
          : next.slide;
      player = createPresentationAnimationPlayer(slide, next.width, next.height);
      player.reset(
        view.performance.now() + (next.mode === 'slideshow' ? (next.entryDelay ?? 0) : 0),
      );
    }
    if (next.mode === 'slideshow')
      while (player && player.step < next.step) if (!player.advance(view.performance.now())) break;
    previous = next;
    view.cancelAnimationFrame(raf);
    paint(view.performance.now());
  }
  update(initial);
  return { update, destroy: clear };
}
