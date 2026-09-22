<script lang="ts">
  import type { SlideObject } from "@tumblerjs/slides";
  let {
    reflection,
    width,
    height,
    source,
    id,
  }: {
    reflection: NonNullable<SlideObject["reflection"]>;
    width: number;
    height: number;
    source: string;
    id: string;
  } = $props();
  // SVG <use> does not paint foreignObject text reliably in Chromium. Mirror a
  // non-interactive DOM copy instead, retaining the source's measured text layout.
  function mirror(node: SVGGElement, sourceId: string) {
    let frame = 0;
    const observer = new MutationObserver(schedule);
    function copy() {
      const original = document.getElementById(sourceId);
      if (!original) return;
      observer.disconnect();
      const clone = original.cloneNode(true) as Element;
      clone.removeAttribute("id");
      for (const element of clone.querySelectorAll("*")) {
        element.removeAttribute("id");
        if (
          element.matches(
            "a,button,input,textarea,select,[tabindex],[contenteditable]",
          )
        )
          element.setAttribute("tabindex", "-1");
        element.removeAttribute("autofocus");
        element.removeAttribute("contenteditable");
      }
      // Paint servers and filters keep referring to the live source definitions.
      for (const definitions of clone.querySelectorAll("defs"))
        definitions.remove();
      node.replaceChildren(clone);
      observer.observe(original, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(copy);
    }
    schedule();
    return {
      update(next: string) {
        sourceId = next;
        schedule();
      },
      destroy() {
        observer.disconnect();
        cancelAnimationFrame(frame);
      },
    };
  }
  let matrix = $derived.by(() => {
    const a = reflection.scaleX,
      d = reflection.scaleY;
    const b = Math.tan((reflection.skewY * Math.PI) / 180) * a;
    const c = Math.tan((reflection.skewX * Math.PI) / 180) * d;
    const alignment = reflection.alignment;
    const x = alignment.includes("l")
      ? 0
      : alignment.includes("r") && alignment !== "ctr"
        ? width
        : width / 2;
    const y =
      alignment.includes("t") && alignment !== "ctr"
        ? 0
        : alignment.includes("b")
          ? height
          : height / 2;
    return [
      a,
      b,
      c,
      d,
      x - a * x - c * y + reflection.x,
      y - b * x - d * y + reflection.y,
    ];
  });
  let fade = $derived.by(() => {
    const radians = (reflection.fadeDirection * Math.PI) / 180;
    const x = Math.cos(radians),
      y = Math.sin(radians);
    const length = Math.abs(x) + Math.abs(y);
    return [
      0.5 - (x * length) / 2,
      0.5 - (y * length) / 2,
      0.5 + (x * length) / 2,
      0.5 + (y * length) / 2,
    ];
  });
</script>

<defs>
  <linearGradient
    id={`${id}-fade`}
    x1={fade[0]}
    y1={fade[1]}
    x2={fade[2]}
    y2={fade[3]}
  >
    <stop
      offset={reflection.startPosition}
      stop-color="white"
      stop-opacity={reflection.startAlpha}
    />
    <stop
      offset={Math.max(reflection.startPosition, reflection.endPosition)}
      stop-color="white"
      stop-opacity={reflection.endAlpha}
    />
  </linearGradient>
  <mask id={`${id}-mask`} maskContentUnits="objectBoundingBox"
    ><rect width="1" height="1" fill={`url(#${id}-fade)`} /></mask
  >
  {#if reflection.blur}<filter
      id={`${id}-blur`}
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"><feGaussianBlur stdDeviation={reflection.blur} /></filter
    >{/if}
</defs>
<g
  class="slide-reflection"
  mask={`url(#${id}-mask)`}
  pointer-events="none"
  aria-hidden="true"
>
  <g
    data-reflection-source={source}
    use:mirror={source}
    transform={`matrix(${matrix.join(" ")})`}
    filter={reflection.blur ? `url(#${id}-blur)` : undefined}
  />
</g>
