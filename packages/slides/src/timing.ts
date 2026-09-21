import type { LosslessXmlElement as Element } from "@tumblerjs/ooxml";
export interface SlideAnimation {
  readonly target: string;
  readonly kind: "fade" | "appear" | "wipe";
  readonly entrance: boolean;
  readonly step: number;
  readonly delay: number;
  readonly duration: number;
  readonly direction: string;
}
export interface SlideTransition {
  readonly kind: string;
  readonly direction: string;
  readonly duration: number;
  readonly advanceAfter?: number;
  readonly advanceOnClick: boolean;
}
const children = (e: Element | undefined) =>
  e?.children.filter((n): n is Element => n.kind === "element") ?? [];
const attr = (e: Element | undefined, n: string) =>
  e?.attributes.find((a) => a.localName === n)?.value;
const child = (e: Element | undefined, n: string) =>
  children(e).find((c) => c.localName === n);
const descendants = (e: Element): Element[] =>
  children(e).flatMap((c) => [c, ...descendants(c)]);
const milliseconds = (s: string | undefined, fallback = 0) =>
  s && /^\d+(\.\d+)?$/.test(s) ? Math.min(3600000, Number(s)) : fallback;
/** Read the click/with/after effect sequence, retaining diagnostics for timing we cannot execute. */
export function readSlideTiming(root: Element) {
  const timing = child(root, "timing"),
    transition = child(root, "transition"),
    warnings = new Set<string>();
  const animations: SlideAnimation[] = [];
  let step = 0,
    lastEnd = 0;
  if (timing) {
    const visit = (
      node: Element,
      inherited: { step: number; delay: number },
    ) => {
      let current = inherited;
      const ctn = child(node, "cTn");
      const type = attr(ctn, "nodeType");
      if (type === "clickEffect") {
        step++;
        lastEnd = 0;
        current = { step, delay: 0 };
      } else if (type === "afterEffect") current = { step, delay: lastEnd };
      else if (type === "withEffect")
        current = { step, delay: inherited.delay };
      const conditions = children(child(ctn, "stCondLst"));
      current = {
        ...current,
        delay:
          current.delay +
          Math.max(0, ...conditions.map((c) => milliseconds(attr(c, "delay")))),
      };
      if (
        conditions.some(
          (c) =>
            attr(c, "evt") &&
            !["onBegin", "onEnd", "onNext"].includes(attr(c, "evt")!),
        )
      )
        warnings.add("Interactive animation triggers are not supported yet.");
      if (["animEffect", "set"].includes(node.localName)) {
        const behavior = child(node, "cBhvr"),
          common = child(behavior, "cTn"),
          target = child(child(behavior, "tgtEl"), "spTgt");
        const id = attr(target, "spid"),
          filter = attr(node, "filter") ?? "fade";
        const value = attr(child(child(node, "to"), "strVal"), "val");
        const visibility =
          node.localName === "set" &&
          descendants(behavior ?? node).some(
            (e) =>
              e.localName === "attrName" &&
              e.children.some(
                (t) => t.kind === "text" && t.value === "style.visibility",
              ),
          );
        if (node.localName === "set" && !visibility) {
          warnings.add(
            "Some animation property changes are not supported yet.",
          );
          return;
        }
        const kind =
          node.localName === "set"
            ? "appear"
            : filter === "fade"
              ? "fade"
              : filter.startsWith("wipe")
                ? "wipe"
                : undefined;
        if (!kind || !id || children(target).length) {
          warnings.add(
            "Some animation effects or paragraph targets are not supported yet.",
          );
          return;
        }
        const delay =
          current.delay +
          Math.max(
            0,
            ...children(child(common, "stCondLst")).map((c) =>
              milliseconds(attr(c, "delay")),
            ),
          );
        const duration =
          kind === "appear" ? 0 : milliseconds(attr(common, "dur"), 500);
        // Visibility setters in a preset's main effect duplicate its entrance/exit behavior.
        if (kind === "appear" && current.step === 0 && value === "hidden")
          return;
        animations.push({
          target: id,
          kind,
          entrance:
            kind === "appear"
              ? value !== "hidden"
              : attr(node, "transition") !== "out",
          step: current.step,
          delay,
          duration,
          direction: filter.match(/\(([^)]+)\)/)?.[1] ?? "left",
        });
        lastEnd = Math.max(lastEnd, delay + duration);
        return;
      }
      if (
        [
          "anim",
          "animMotion",
          "animRot",
          "animScale",
          "animClr",
          "cmd",
          "audio",
          "video",
        ].includes(node.localName)
      )
        warnings.add("Some animation behaviors are not supported yet.");
      if (
        ctn &&
        ["repeatCount", "repeatDur", "autoRev", "spd", "accel", "decel"].some(
          (name) => attr(ctn, name) !== undefined,
        )
      )
        warnings.add(
          "Animation repeats and custom acceleration are not supported yet.",
        );
      for (const c of children(node)) visit(c, current);
    };
    visit(timing, { step: 0, delay: 0 });
  }
  const effect = children(transition).find(
    (e) => !["sndAc", "extLst"].includes(e.localName),
  );
  const duration = milliseconds(
    attr(transition, "dur"),
    attr(transition, "spd") === "fast"
      ? 500
      : attr(transition, "spd") === "slow"
        ? 1000
        : 750,
  );
  const advance = attr(transition, "advTm");
  const result: SlideTransition | undefined = transition
    ? {
        kind: effect?.localName ?? "cut",
        direction: attr(effect, "dir") ?? "l",
        duration,
        advanceOnClick: attr(transition, "advClick") !== "0",
        ...(advance ? { advanceAfter: milliseconds(advance) } : {}),
      }
    : undefined;
  if (
    effect &&
    !["fade", "cut", "wipe", "push", "cover"].includes(effect.localName)
  )
    warnings.add(`Slide transition ${effect.localName} is not supported yet.`);
  return { animations, transition: result, warnings: [...warnings] };
}
