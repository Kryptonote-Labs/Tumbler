import type { SlideParagraph } from "@tumblerjs/slides";
/** Position tab runs against authored stops; keep the tab character in the DOM for caret offsets. */
export function presentationTabs(node: HTMLElement, initial: SlideParagraph) {
  let active: ReturnType<typeof attachTabs> | undefined;
  function update(paragraph: SlideParagraph) {
    if (paragraph.runs.some((run) => run.text.includes("\t"))) {
      if (active) active.update(paragraph);
      else active = attachTabs(node, paragraph);
    } else {
      active?.destroy();
      active = undefined;
    }
  }
  update(initial);
  return {
    update,
    destroy() {
      active?.destroy();
    },
  };
}
function attachTabs(node: HTMLElement, initial: SlideParagraph) {
  let paragraph = initial,
    frame = 0;
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  function measure() {
    const scale = node.getBoundingClientRect().width / node.offsetWidth || 1;
    const origin = node.getBoundingClientRect();
    const tabs = Array.from(node.querySelectorAll<HTMLElement>("[data-tab]"));
    for (const tab of tabs) {
      tab.style.width = "0px";
      const rect = tab.getBoundingClientRect();
      const x =
        (paragraph.rtl ? origin.right - rect.right : rect.left - origin.left) /
        scale;
      const stop = paragraph.tabs?.find((s) => s.position > x + 0.1);
      const step = paragraph.defaultTabSize ?? 96;
      const position = stop?.position ?? (Math.floor(x / step) + 1) * step;
      let following = "";
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let seen = false;
      while (walker.nextNode()) {
        if (tab.contains(walker.currentNode)) {
          seen = true;
          continue;
        }
        if (!seen) continue;
        const text = walker.currentNode.textContent ?? "";
        if (text.includes("\t")) break;
        following += text;
      }
      ctx.font = getComputedStyle(tab).font;
      const alignment = stop?.alignment;
      const suffix =
        alignment === "dec" ? following.split(/[.,]/)[0]! : following;
      const correction =
        alignment === "r" || alignment === "dec"
          ? ctx.measureText(suffix).width
          : alignment === "ctr"
            ? ctx.measureText(following).width / 2
            : 0;
      tab.style.width = `${Math.max(0, position - x - correction)}px`;
    }
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(node);
  document.fonts.addEventListener("loadingdone", schedule);
  schedule();
  return {
    update(next: SlideParagraph) {
      paragraph = next;
      schedule();
    },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", schedule);
    },
  };
}
