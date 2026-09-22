<script lang="ts">
  import {
    layoutCombinationChart,
    type SupportedChartModel,
    type ChartSeries,
  } from "@tumblerjs/charts";
  let {
    model,
    width,
    height,
    color,
  }: {
    model: SupportedChartModel;
    width: number;
    height: number;
    color: (series: ChartSeries, index: number, line?: boolean) => string;
  } = $props();
  let plots = $derived(layoutCombinationChart(model, width, height));
  const ticks = (min: number, max: number) =>
    Array.from({ length: 6 }, (_, i) => min + ((max - min) * i) / 5);
  function positionLegend(
    node: SVGGElement,
    options: { model: SupportedChartModel; width: number; height: number },
  ) {
    let frame = 0;
    function update(next: typeof options) {
      options = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = Array.from(node.children).filter(
          (item): item is SVGGElement => item instanceof SVGGElement,
        );
        const position = options.model.legend?.position ?? "right";
        const horizontal = position === "top" || position === "bottom";
        const widths = items.map((item) => item.getBBox().width);
        const total =
          widths.reduce((sum, value) => sum + value, 0) +
          Math.max(0, items.length - 1) * 24;
        let x = horizontal
          ? (options.width - total) / 2
          : position === "left"
            ? 8
            : options.width - Math.max(0, ...widths) - 8;
        let y =
          position === "bottom"
            ? options.height - 12
            : position === "top" || position === "top-right"
              ? options.model.title
                ? 42
                : 18
              : (options.height - items.length * 20) / 2 + 12;
        items.forEach((item, index) => {
          item.setAttribute("transform", `translate(${x} ${y})`);
          if (horizontal) x += widths[index]! + 24;
          else y += 20;
        });
      });
    }
    const fonts = () => update(options);
    document.fonts.addEventListener("loadingdone", fonts);
    update(options);
    return {
      update,
      destroy() {
        cancelAnimationFrame(frame);
        document.fonts.removeEventListener("loadingdone", fonts);
      },
    };
  }
</script>

<svg
  role="img"
  aria-label={model.title ?? "Combination chart"}
  viewBox={`0 0 ${width} ${height}`}
>
  <title>{model.title ?? "Combination chart"}</title><rect
    {width}
    {height}
    fill="white"
  />
  {#if model.title}<text
      x={width / 2}
      y="22"
      text-anchor="middle"
      font-size="15"
      font-weight="600">{model.title}</text
    >{/if}
  {#each plots as plot, plotIndex}
    {@const horizontal = plot.model.kind === "bar"}
    {@const count = Math.max(1, plot.categories.length)}
    {@const band = (horizontal ? plot.plot.height : plot.plot.width) / count}
    {#if plots.findIndex((p) => p.axis?.id === plot.axis?.id) === plotIndex}
      {#each ticks(plot.minimum, plot.maximum) as tick}
        {@const position = plot.coordinate(tick)}
        {#if horizontal}<text
            x={position}
            y={plot.plot.y + plot.plot.height + 15}
            text-anchor="middle">{Number(tick.toPrecision(3))}</text
          >
        {:else}<text
            x={plot.axis?.position === "right"
              ? plot.plot.x + plot.plot.width + 5
              : plot.plot.x - 5}
            y={position + 4}
            text-anchor={plot.axis?.position === "right" ? "start" : "end"}
            >{Number(tick.toPrecision(3))}</text
          >{/if}
        {#if plotIndex === 0 && !horizontal}<line
            x1={plot.plot.x}
            x2={plot.plot.x + plot.plot.width}
            y1={position}
            y2={position}
            stroke="#ddd"
          />{/if}
      {/each}
    {/if}
    {#each plot.model.series as series, s}
      {@const points = plot.points[s]!}
      {@const seriesIndex = model.series.findIndex(
        (item) => item.index === series.index,
      )}
      {@const stacked =
        plot.model.grouping === "stacked" ||
        plot.model.grouping === "percent-stacked"}
      {@const thickness =
        (band * 0.72) / (stacked ? 1 : Math.max(1, plot.model.series.length))}
      {#if plot.model.kind === "line"}
        <path
          d={points
            .map((point, c) =>
              point
                ? `${points[c - 1] ? "L" : "M"} ${plot.plot.x + (c + 0.5) * band} ${point.end}`
                : "",
            )
            .join(" ")}
          fill="none"
          stroke={color(series, seriesIndex, true)}
          stroke-width="2"
        />
      {:else}
        {#each points as point, c}{#if point}
            {@const offset =
              c * band + band * 0.14 + (stacked ? 0 : s) * thickness}
            <rect
              x={horizontal
                ? Math.min(point.start, point.end)
                : plot.plot.x + offset}
              y={horizontal
                ? plot.plot.y + offset
                : Math.min(point.start, point.end)}
              width={horizontal
                ? Math.abs(point.start - point.end)
                : Math.max(1, thickness - 1)}
              height={horizontal
                ? Math.max(1, thickness - 1)
                : Math.abs(point.start - point.end)}
              fill={color(series, seriesIndex)}
            />
          {/if}{/each}
      {/if}
    {/each}
  {/each}
  {#if plots[0]}{@const p = plots[0]}
    {#each p.categories as category, c}<text
        x={p.model.kind === "bar"
          ? p.plot.x - 8
          : p.plot.x +
            ((c + 0.5) * p.plot.width) / Math.max(1, p.categories.length)}
        y={p.model.kind === "bar"
          ? p.plot.y +
            ((c + 0.5) * p.plot.height) / Math.max(1, p.categories.length) +
            4
          : p.plot.y + p.plot.height + 17}
        text-anchor={p.model.kind === "bar" ? "end" : "middle"}>{category}</text
      >{/each}{/if}
  {#if model.legend}<g
      class="combination-legend"
      use:positionLegend={{ model, width, height }}
      >{#each model.series as series, i}<g
          transform={`translate(${16 + i * 110} ${height - 10})`}
          ><rect width="8" height="8" y="-8" fill={color(series, i)} /><text
            x="12">{series.title ?? `Series ${i + 1}`}</text
          ></g
        >{/each}</g
    >{/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    background: white;
    color: #333;
    font:
      11px Calibri,
      Arial,
      sans-serif;
  }
  text {
    fill: #333;
  }
</style>
