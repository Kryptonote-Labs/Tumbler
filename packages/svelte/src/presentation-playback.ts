import type { PresentationSlide } from "@tumblerjs/slides";
export interface PlaybackOptions {
  slide: PresentationSlide;
  playing: boolean;
  step: number;
  editable: boolean;
  entryDelay?: number;
}
/** Steps are click groups; automatic, with and after effects share their group's step. */
export function nextPresentationAnimationStep(
  slide: Pick<PresentationSlide, "animations">,
  step: number,
): number | undefined {
  const steps = (slide.animations ?? []).map((effect) => effect.step).filter((next) => next > step);
  return steps.length ? Math.min(...steps) : undefined;
}
const wipe = (direction: string) =>
  direction === "right"
    ? "inset(0 0 0 100%)"
    : direction === "up"
      ? "inset(100% 0 0 0)"
      : direction === "down"
        ? "inset(0 0 100% 0)"
        : "inset(0 100% 0 0)";
/** Playback is presentation-only and never rewrites the editing scene or the package. */
export function presentationPlayback(
  node: SVGSVGElement,
  initial: PlaybackOptions,
) {
  let options = initial,
    lastSlide = "",
    lastStep = -1,
    started = false;
  let running: Animation[] = [];
  function clear() {
    for (const animation of running) animation.cancel();
    running = [];
    for (const target of node.querySelectorAll<SVGElement>(
      "[data-animation-target]",
    )) {
      target.style.removeProperty("opacity");
      target.style.removeProperty("clip-path");
    }
  }
  function update(next: PlaybackOptions) {
    options = next;
    const changed = lastSlide !== options.slide.part;
    if (
      changed ||
      !options.playing ||
      options.editable ||
      options.step < lastStep
    ) {
      clear();
      lastStep = -1;
      started = false;
    }
    lastSlide = options.slide.part;
    if (!options.playing || options.editable) return;
    const animations = options.slide.animations ?? [];
    if (!started) {
      for (const effect of animations)
        if (effect.entrance) {
          const target = Array.from(
            node.querySelectorAll<SVGElement>("[data-animation-target]"),
          ).find((e) => e.dataset.animationTarget === effect.target);
          if (target) target.style.opacity = "0";
        }
      started = true;
    }
    if (options.step === lastStep) return;
    for (const animation of running)
      try {
        animation.finish();
      } catch {}
    for (const effect of animations.filter(
      (effect) => effect.step > lastStep && effect.step <= options.step,
    )) {
      const target = Array.from(
        node.querySelectorAll<SVGElement>("[data-animation-target]"),
      ).find((e) => e.dataset.animationTarget === effect.target);
      if (!target) continue;
      const frames =
        effect.kind === "wipe"
          ? [
              {
                clipPath: effect.entrance ? wipe(effect.direction) : "inset(0)",
                opacity: 1,
              },
              {
                clipPath: effect.entrance ? "inset(0)" : wipe(effect.direction),
                opacity: 1,
              },
            ]
          : [
              { opacity: effect.entrance ? 0 : 1 },
              { opacity: effect.entrance ? 1 : 0 },
            ];
      running.push(
        target.animate(frames, {
          duration: effect.duration,
          delay: effect.delay + (options.entryDelay ?? 0),
          fill: "forwards",
          easing: "linear",
        }),
      );
    }
    lastStep = options.step;
  }
  update(initial);
  return { update, destroy: clear };
}
