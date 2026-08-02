<script lang="ts">
  import {
    chartSequenceValue,
    chartValueCoordinate,
    layoutCartesianChart,
    layoutPieSlices,
    pieArcPath,
    type ChartColor,
    type ChartModel,
    type ChartSeries,
    type SupportedChartModel,
  } from "@tumbler/charts";

  interface Props {
    readonly model: ChartModel;
    readonly width: number;
    readonly height: number;
    readonly resolveColor?: (color: ChartColor) => string | undefined;
  }

  let { model, width, height, resolveColor }: Props = $props();
  const palette = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"] as const;
  let accessibleName = $derived(model.title ?? (model.status === "supported" ? `${model.kind} chart` : "Chart preview unavailable"));

  function color(series: ChartSeries, index: number, line = false): string {
    const authored = line ? series.line ?? series.fill : series.fill ?? series.line;
    const themed = authored ?? { kind: "scheme" as const, value: `accent${index % 6 + 1}` };
    return resolveColor?.(themed) ??
      (authored?.kind === "rgb" ? authored.value : undefined) ?? palette[index % palette.length]!;
  }

  function value(model: SupportedChartModel, series: ChartSeries, index: number): number | undefined {
    const point = chartSequenceValue(series.values, index);
    return typeof point === "number" ? point : undefined;
  }

  function linePath(model: SupportedChartModel, series: ChartSeries): string {
    const layout = layoutCartesianChart(model, width, height);
    const count = Math.max(1, layout.categories.length);
    let path = "";
    let previous = -2;
    for (let index = 0; index < count; index += 1) {
      const current = value(model, series, index);
      if (current === undefined) continue;
      const x = layout.plot.x + (index + 0.5) / count * layout.plot.width;
      const y = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true);
      path += `${index === previous + 1 ? " L" : " M"} ${x} ${y}`;
      previous = index;
    }
    return path.trim();
  }

  function labelStep(count: number, available: number): number {
    return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(available / 58))));
  }

  function legendX(model: SupportedChartModel, index: number): number {
    return model.legend?.position === "left" ? 8
      : model.legend?.position === "bottom" || model.legend?.position === "top" ? 16 + index * 110
      : width - 94;
  }

  function legendY(model: SupportedChartModel, index: number): number {
    return model.legend?.position === "bottom" ? height - 16
      : model.legend?.position === "top" ? (model.title === undefined ? 14 : 30)
      : 38 + index * 18;
  }
</script>

{#if model.status === "unsupported"}
  <div class="chart-fallback" role="img" aria-label={accessibleName} title={model.reason}>
    <span>Chart preview unavailable</span>
  </div>
{:else if model.kind === "pie" || model.kind === "doughnut"}
  {@const slices = layoutPieSlices(model)}
  {@const centerX = width * 0.44}
  {@const centerY = height * 0.53}
  {@const radius = Math.max(1, Math.min(width * 0.3, height * 0.34))}
  <svg class="chart" role="img" aria-label={accessibleName} viewBox={`0 0 ${width} ${height}`}>
    <title>{accessibleName}</title>
    <rect width={width} height={height} fill="#fff" />
    {#if model.title !== undefined}<text class="title" x={width / 2} y="22" text-anchor="middle">{model.title}</text>{/if}
    {#each slices as slice, index (slice.index)}
      <path
        d={pieArcPath(centerX, centerY, radius, slice.startAngle, slice.endAngle, model.kind === "doughnut" ? radius * (model.holeSize ?? 50) / 100 : 0)}
        fill={color(model.series[0]!, index)}
        stroke="#fff"
        stroke-width="1"
      />
    {/each}
    {#if model.legend !== undefined}
      {#each slices as slice, index (slice.index)}
        <g transform={`translate(${width * 0.76} ${40 + index * 20})`}>
          <rect width="10" height="10" y="-8" fill={color(model.series[0]!, index)} />
          <text x="15">{chartSequenceValue(model.series[0]?.categories, slice.index) ?? slice.index + 1}</text>
        </g>
      {/each}
    {/if}
  </svg>
{:else}
  {@const layout = layoutCartesianChart(model, width, height)}
  {@const count = Math.max(1, layout.categories.length)}
  {@const baselineX = chartValueCoordinate(0, layout.minimum, layout.maximum, layout.plot.x, layout.plot.width)}
  {@const baselineY = chartValueCoordinate(0, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)}
  <svg class="chart" role="img" aria-label={accessibleName} viewBox={`0 0 ${width} ${height}`}>
    <title>{accessibleName}</title>
    <rect width={width} height={height} fill="#fff" />
    {#if model.title !== undefined}<text class="title" x={width / 2} y="22" text-anchor="middle">{model.title}</text>{/if}
    {#if model.axes.some((axis) => axis.kind === "value" && axis.majorGridlines)}
      {#each layout.ticks as tick (tick)}
        {#if model.kind === "bar"}
          {@const x = chartValueCoordinate(tick, layout.minimum, layout.maximum, layout.plot.x, layout.plot.width)}
          <line class="gridline" x1={x} x2={x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />
          <text class="tick" x={x} y={layout.plot.y + layout.plot.height + 16} text-anchor="middle">{tick}</text>
        {:else}
          {@const y = chartValueCoordinate(tick, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)}
          <line class="gridline" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={y} y2={y} />
          <text class="tick" x={layout.plot.x - 6} y={y + 4} text-anchor="end">{tick}</text>
        {/if}
      {/each}
    {/if}
    <line class="axis" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={model.kind === "bar" ? layout.plot.y + layout.plot.height : baselineY} y2={model.kind === "bar" ? layout.plot.y + layout.plot.height : baselineY} />
    <line class="axis" x1={model.kind === "bar" ? baselineX : layout.plot.x} x2={model.kind === "bar" ? baselineX : layout.plot.x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />

    {#if model.kind === "column"}
      {#each model.series as series, seriesIndex (series.index)}
        {#each layout.categories as _category, index (index)}
          {@const current = value(model, series, index)}
          {#if current !== undefined}
            {@const band = layout.plot.width / count}
            {@const seriesWidth = band * 0.72 / Math.max(1, model.series.length)}
            {@const y = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)}
            <rect x={layout.plot.x + index * band + band * 0.14 + seriesIndex * seriesWidth} y={Math.min(y, baselineY)} width={Math.max(1, seriesWidth - 1)} height={Math.max(0.5, Math.abs(baselineY - y))} fill={color(series, seriesIndex)} />
          {/if}
        {/each}
      {/each}
    {:else if model.kind === "bar"}
      {#each model.series as series, seriesIndex (series.index)}
        {#each layout.categories as _category, index (index)}
          {@const current = value(model, series, index)}
          {#if current !== undefined}
            {@const band = layout.plot.height / count}
            {@const seriesHeight = band * 0.72 / Math.max(1, model.series.length)}
            {@const x = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.x, layout.plot.width)}
            <rect x={Math.min(x, baselineX)} y={layout.plot.y + index * band + band * 0.14 + seriesIndex * seriesHeight} width={Math.max(0.5, Math.abs(baselineX - x))} height={Math.max(1, seriesHeight - 1)} fill={color(series, seriesIndex)} />
          {/if}
        {/each}
      {/each}
    {:else}
      {#each model.series as series, seriesIndex (series.index)}
        <path d={linePath(model, series)} fill="none" stroke={color(series, seriesIndex, true)} stroke-width="2" />
        {#each layout.categories as _category, index (index)}
          {@const current = value(model, series, index)}
          {#if current !== undefined}
            <circle cx={layout.plot.x + (index + 0.5) / count * layout.plot.width} cy={chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)} r="3" fill={color(series, seriesIndex, true)} />
          {/if}
        {/each}
      {/each}
    {/if}

    {#each layout.categories as category, index (index)}
      {#if index % labelStep(count, model.kind === "bar" ? layout.plot.height : layout.plot.width) === 0}
        {#if model.kind === "bar"}
          <text class="category" x={layout.plot.x - 7} y={layout.plot.y + (index + 0.5) / count * layout.plot.height + 4} text-anchor="end">{category}</text>
        {:else}
          <text class="category" x={layout.plot.x + (index + 0.5) / count * layout.plot.width} y={layout.plot.y + layout.plot.height + 17} text-anchor="middle">{category}</text>
        {/if}
      {/if}
    {/each}
    {#if model.legend !== undefined}
      {#each model.series as series, index (series.index)}
        <g transform={`translate(${legendX(model, index)} ${legendY(model, index)})`}>
          <rect width="10" height="10" y="-8" fill={color(series, index)} />
          <text x="15">{series.title ?? `Series ${index + 1}`}</text>
        </g>
      {/each}
    {/if}
  </svg>
{/if}

<style>
  .chart, .chart-fallback { display: block; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; color: #333; background: #fff; border: 1px solid #d9d9d9; font: 11px/1.2 Calibri, Aptos, system-ui, sans-serif; }
  .chart { pointer-events: none; }
  .title { fill: #222; font-size: 15px; font-weight: 600; }
  .axis { stroke: #777; stroke-width: 1; shape-rendering: crispEdges; }
  .gridline { stroke: #d9d9d9; stroke-width: 1; shape-rendering: crispEdges; }
  .tick, .category { fill: #555; font-size: 10px; }
  .chart-fallback { display: grid; place-items: center; padding: 12px; color: #666; background: repeating-linear-gradient(135deg, #fff, #fff 8px, #f7f7f7 8px, #f7f7f7 16px); text-align: center; }
</style>
