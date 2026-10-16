import type { SupportedChartModel } from "@tumblerjs/charts";

interface LegendOptions {
  readonly model: SupportedChartModel;
  readonly width: number;
  readonly height: number;
}

/** Position actual swatch/label bounds, rather than equally sized label slots. */
export function chartLegendPositions(widths: readonly number[], options: LegendOptions) {
  const position = options.model.legend?.position ?? "right";
  const horizontal = position === "bottom" || position === "top";
  const gap = 12;
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  let x = horizontal ? (options.width - total) / 2 : position === "left" ? 8 : options.width - Math.max(0, ...widths) - 8;
  let y = position === "bottom" ? options.height - 16
    : position === "top" || position === "top-right" ? (options.model.title === undefined ? 18 : 48)
    : (options.height - widths.length * 20) / 2 + 12;
  return widths.map(width => {
    const point = { x, y };
    if (horizontal) x += width + gap;
    else y += 20;
    return point;
  });
}

/** Re-measure after font loading and reactive chart-size/model changes. */
export function positionChartLegend(node: SVGGElement, options: LegendOptions) {
  let frame = 0;
  function measure() {
    const items = Array.from(node.children).filter((item): item is SVGGElement => item instanceof SVGGElement);
    const bounds = items.map(item => item.getBBox());
    const positions = chartLegendPositions(bounds.map(bound => bound.width), options);
    items.forEach((item, index) => {
      const point = positions[index]!;
      item.setAttribute("transform", `translate(${point.x - bounds[index]!.x} ${point.y})`);
    });
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
  document.fonts.addEventListener("loadingdone", schedule);
  schedule();
  return {
    update(next: LegendOptions) { options = next; schedule(); },
    destroy() { cancelAnimationFrame(frame); document.fonts.removeEventListener("loadingdone", schedule); },
  };
}
