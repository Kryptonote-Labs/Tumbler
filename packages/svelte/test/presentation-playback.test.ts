import { expect, test } from "bun:test";
import type { PresentationSlide } from "@tumblerjs/slides";
import { nextPresentationAnimationStep, presentationPlayback } from "../src/presentation-playback.ts";

const effect = (target: string, step: number, delay = 0) => ({
  target, step, delay, kind: "fade" as const, entrance: true, duration: 250, direction: "left",
});
const slide: PresentationSlide = {
  id: "one", part: "one.xml", title: "", hidden: false, notes: "", background: "#fff",
  backgroundGradient: undefined, objects: [], diagnostics: [],
  animations: [effect("auto", 0), effect("first", 1), effect("together", 1, 250), effect("last", 3)],
};

test("advance consumes click groups, including gaps, then yields slide navigation", () => {
  expect(nextPresentationAnimationStep(slide, 0)).toBe(1);
  expect(nextPresentationAnimationStep(slide, 1)).toBe(3);
  expect(nextPresentationAnimationStep(slide, 3)).toBeUndefined();
  expect(nextPresentationAnimationStep({}, 0)).toBeUndefined();
  expect(nextPresentationAnimationStep({ animations: [effect("auto", 0)] }, 0)).toBeUndefined();
});

test("show entry, advancing, slide changes and exit preserve playback lifecycle", () => {
  const calls: { target: string; options: KeyframeAnimationOptions; cancelled: boolean; finished: boolean }[] = [];
  const targets = slide.animations!.map((effect) => ({
    dataset: { animationTarget: effect.target },
    style: { opacity: "", removeProperty() { this.opacity = ""; } },
    animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
      const call = { target: effect.target, options, cancelled: false, finished: false };
      calls.push(call);
      return { cancel() { call.cancelled = true; }, finish() { call.finished = true; } };
    },
  }));
  // Only the DOM methods used by the action are needed to observe Web Animations calls.
  const node = { querySelectorAll: () => targets } as unknown as SVGSVGElement;
  const options = { slide, playing: true, editable: false, step: 0 };
  const playback = presentationPlayback(node, options);
  expect(calls.map((call) => call.target)).toEqual(["auto"]);
  expect(targets.every((target) => target.style.opacity === "0")).toBe(true);
  playback.update({ ...options, step: 1 });
  expect(calls.map((call) => call.target)).toEqual(["auto", "first", "together"]);
  expect(calls[2]!.options.delay).toBe(250);
  playback.update({ ...options, step: 1 });
  expect(calls).toHaveLength(3);
  playback.update({ ...options, step: 3 });
  expect(calls.at(-1)!.target).toBe("last");
  expect(calls[1]!.finished).toBe(true);
  playback.update({ ...options, slide: { ...slide, part: "two.xml" } });
  expect(calls.slice(0, 4).every((call) => call.cancelled)).toBe(true);
  expect(calls.at(-1)!.target).toBe("auto");
  playback.update({ ...options, playing: false });
  expect(calls.every((call) => call.cancelled)).toBe(true);
  expect(targets.every((target) => target.style.opacity === "")).toBe(true);
  playback.update(options);
  expect(calls.at(-1)!.cancelled).toBe(false);
  playback.destroy();
  expect(calls.every((call) => call.cancelled)).toBe(true);
});

test("editing and thumbnails remain static", () => {
  const node = { querySelectorAll: () => [] } as unknown as SVGSVGElement;
  const playback = presentationPlayback(node, { slide, playing: true, editable: true, step: 0 });
  playback.destroy();
});
