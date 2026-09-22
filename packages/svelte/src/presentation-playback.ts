import type { PresentationSlide } from "@tumblerjs/slides";
export interface PlaybackOptions {
  slide: PresentationSlide;
  playing: boolean;
  step: number;
  editable: boolean;
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
    if (changed && lastSlide && !options.editable) {
      const transition = options.slide.transition;
      if (transition) {
        const direction = transition.direction,
          vertical = direction === "u" || direction === "d";
        const offset =
          direction === "r" || direction === "d" ? "-100%" : "100%";
        const frames =
          transition.kind === "fade"
            ? [{ opacity: 0 }, { opacity: 1 }]
            : transition.kind === "wipe"
              ? [
                  {
                    clipPath: wipe(
                      (
                        { l: "left", r: "right", u: "up", d: "down" } as Record<
                          string,
                          string
                        >
                      )[direction] ?? "left",
                    ),
                  },
                  { clipPath: "inset(0)" },
                ]
              : ["push", "cover"].includes(transition.kind)
                ? [
                    {
                      transform: `translate${vertical ? "Y" : "X"}(${offset})`,
                    },
                    { transform: "translate(0)" },
                  ]
                : undefined;
        if (frames)
          running.push(
            node.animate(frames, {
              duration: transition.duration,
              easing: "linear",
            }),
          );
      }
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
          delay: effect.delay,
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
