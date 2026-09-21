import type { SlideText } from "@tumblerjs/slides";
export interface TextLayoutOptions {
  text: SlideText;
  onheight?: (height: number) => void;
}
/** Measure after fonts and container sizes settle, without changing saved document bytes. */
export function presentationTextLayout(
  node: HTMLElement,
  initial: TextLayoutOptions,
) {
  let options = initial,
    frame = 0,
    lastHeight = -1;
  const content = () => node.querySelector<HTMLElement>(".paragraphs")!;
  function measure() {
    const body = content();
    if (!body || !node.clientWidth) return;
    body.style.zoom = "1";
    body.style.width = "100%";
    body.style.removeProperty("line-clamp");
    body.style.removeProperty("-webkit-line-clamp");
    body.style.removeProperty("display");
    body.style.removeProperty("-webkit-box-orient");
    const style = getComputedStyle(node);
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const available = Math.max(1, node.clientHeight - padding);
    if (options.text.autoFit === "normal" && body.scrollHeight > available) {
      let low = 0.05,
        high = 1;
      for (let i = 0; i < 12; i++) {
        const scale = (low + high) / 2;
        body.style.zoom = String(scale);
        body.style.width = `${100 / scale}%`;
        if (body.scrollHeight * scale > available) high = scale;
        else low = scale;
      }
      body.style.zoom = String(low);
      body.style.width = `${100 / low}%`;
    } else if (options.text.autoFit === "shape") {
      const height = Math.ceil(body.scrollHeight + padding);
      if (height !== lastHeight) {
        lastHeight = height;
        options.onheight?.(height);
      }
    } else if (options.text.verticalOverflow === "ellipsis") {
      // Clamp at whole lines and let Chromium paint its ellipsis at the last visible line.
      const p = body.querySelector("p");
      const line = p ? parseFloat(getComputedStyle(p).lineHeight) : 0;
      if (line > 0) {
        body.style.display = "-webkit-box";
        body.style.webkitBoxOrient = "vertical";
        body.style.webkitLineClamp = String(
          Math.max(1, Math.floor(available / line)),
        );
        body.style.overflow = "hidden";
      }
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
    update(next: TextLayoutOptions) {
      options = next;
      schedule();
    },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", schedule);
    },
  };
}
