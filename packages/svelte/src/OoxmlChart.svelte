<script lang="ts">
  import CombinationChart from "./CombinationChart.svelte";
  import {
    cartesianStack,
    chartSequenceValue,
    chartValueCoordinate,
    layoutBubbleChart,
    layoutCartesianChart,
    layoutPieSlices,
    layoutScatterChart,
    pieArcPath,
    scatterLinePath,
    type ChartAxis,
    type ChartColor,
    type ChartModel,
    type ChartSeries,
    type SupportedChartModel,
  } from "@tumblerjs/charts";

  interface Props {
    readonly model: ChartModel;
    readonly width: number;
    readonly height: number;
    readonly resolveColor?: (color: ChartColor) => string | undefined;
    readonly formatNumber?: (value: number, formatCode: string | undefined) => string;
    readonly clipId?: string;
  }

  let { model, width, height, resolveColor, formatNumber, clipId = "tumbler-scatter-clip" }: Props = $props();
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
    return typeof point === "number" ? cartesianStack(model, model.series.indexOf(series), index)?.end : undefined;
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

  function pieLayout(model: SupportedChartModel, count: number) {
    const padding = 16;
    const titleHeight = model.title === undefined ? padding : 36;
    const position = model.legend?.position;
    const horizontal = position === "top" || position === "bottom";
    const columns = Math.max(1, Math.min(count, Math.floor((width - padding * 2) / 110)));
    const rows = Math.ceil(count / columns);
    const legendHeight = horizontal ? rows * 20 + 8 : 0;
    const sideWidth = Math.min(120, width * 0.25);
    const reserve = model.legend !== undefined && !model.legend.overlay;
    const left = padding + (reserve && position === "left" ? sideWidth : 0);
    const right = width - padding - (reserve && (position === "right" || position === "top-right") ? sideWidth : 0);
    const top = titleHeight + (reserve && position === "top" ? legendHeight : 0);
    const bottom = height - padding - (reserve && position === "bottom" ? legendHeight : 0);
    return {
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      radius: Math.max(1, Math.min(right - left, bottom - top) / 2),
      legend: Array.from({ length: count }, (_, index) => {
        if (horizontal) {
          const row = Math.floor(index / columns);
          const rowCount = Math.min(columns, count - row * columns);
          return {
            x: (width - rowCount * 110) / 2 + (index % columns) * 110,
            y: (position === "bottom" ? height - padding - legendHeight : titleHeight) + 16 + row * 20,
          };
        }
        return { x: position === "left" ? padding : width - sideWidth, y: titleHeight + 16 + index * 20 };
      }),
    };
  }

  /** Centre each legend row using its rendered swatches and labels, not its spacing slots. */
  function centerPieLegend(node: SVGGElement, options: { width: number; layout: ReturnType<typeof pieLayout>; horizontal: boolean }) {
    let frame = 0;
    function measure() {
      const items = [...node.children].filter((child): child is SVGGElement => child instanceof SVGGElement);
      const rows = new Map<number, { left: number; right: number }>();
      items.forEach((item, index) => {
        const position = options.layout.legend[index];
        if (position === undefined) return;
        const bounds = item.getBBox();
        const row = rows.get(position.y);
        rows.set(position.y, {
          left: Math.min(row?.left ?? Infinity, position.x + bounds.x),
          right: Math.max(row?.right ?? -Infinity, position.x + bounds.x + bounds.width),
        });
      });
      items.forEach((item, index) => {
        const position = options.layout.legend[index];
        if (position === undefined) return;
        const row = rows.get(position.y)!;
        const shift = options.horizontal ? options.width / 2 - (row.left + row.right) / 2 : 0;
        item.setAttribute("transform", `translate(${position.x + shift} ${position.y})`);
      });
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
    schedule();
    document.fonts.addEventListener("loadingdone", schedule);
    return {
      update(next: typeof options) { options = next; schedule(); },
      destroy() { cancelAnimationFrame(frame); document.fonts.removeEventListener("loadingdone", schedule); },
    };
  }

  function scatterAxis(model: SupportedChartModel, index: number): ChartAxis | undefined {
    const id = model.axisIds?.[index];
    if (id !== undefined) return model.axes.find((axis) => axis.id === id && !axis.deleted);
    return model.axes.filter((axis) => axis.kind === "value" && !axis.deleted)[index];
  }

  function tickLabel(value: number, formatCode: string | undefined): string {
    return formatNumber?.(value, formatCode) ?? new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
  }

  function scatterLineVisible(model: SupportedChartModel, series: ChartSeries): boolean {
    return series.smooth === true || model.scatterStyle === "line" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
  }

  function scatterMarkerVisible(model: SupportedChartModel, series: ChartSeries): boolean {
    return series.marker?.symbol !== "none" && (model.scatterStyle === "marker" || model.scatterStyle === "line-marker" || model.scatterStyle === "smooth-marker");
  }

  function scatterSmooth(model: SupportedChartModel, series: ChartSeries): boolean {
    return series.smooth === true || model.scatterStyle === "smooth" || model.scatterStyle === "smooth-marker";
  }
</script>

{#if model.status === "unsupported"}
  <div class="chart-fallback" role="img" aria-label={accessibleName} title={model.reason}>
    <span>Chart preview unavailable</span>
  </div>
{:else if model.plots}
  <CombinationChart {model} {width} {height} {color}/>
{:else if model.kind === "pie" || model.kind === "doughnut"}
  {@const slices = layoutPieSlices(model)}
  {@const layout = pieLayout(model, slices.length)}
  {@const { centerX, centerY, radius } = layout}
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
      <g class="pie-legend" use:centerPieLegend={{ width, layout, horizontal: model.legend.position === "top" || model.legend.position === "bottom" }}>
      {#each slices as slice, index (slice.index)}
        <g transform={`translate(${layout.legend[index]!.x} ${layout.legend[index]!.y})`}>
          <rect width="10" height="10" y="-8" fill={color(model.series[0]!, index)} />
          <text x="15">{chartSequenceValue(model.series[0]?.categories, slice.index) ?? slice.index + 1}</text>
        </g>
      {/each}
      </g>
    {/if}
  </svg>
{:else if model.kind === "scatter"}
  {@const layout = layoutScatterChart(model, width, height)}
  {@const xAxis = scatterAxis(model, 0)}
  {@const yAxis = scatterAxis(model, 1)}
  {@const xFormat = xAxis?.numberFormatCode ?? model.series.find((series) => series.xValues?.formatCode !== undefined)?.xValues?.formatCode}
  {@const yFormat = yAxis?.numberFormatCode ?? model.series.find((series) => series.values?.formatCode !== undefined)?.values?.formatCode}
  <svg class="chart" role="img" aria-label={accessibleName} viewBox={`0 0 ${width} ${height}`}>
    <title>{accessibleName}</title>
    <rect width={width} height={height} fill="#fff" />
    <defs><clipPath id={clipId}><rect x={layout.plot.x} y={layout.plot.y} width={layout.plot.width} height={layout.plot.height} /></clipPath></defs>
    {#if model.title !== undefined}<text class="title" x={width / 2} y="22" text-anchor="middle">{model.title}</text>{/if}
    {#each layout.yTicks as tick (tick)}
      {@const y = chartValueCoordinate(tick, layout.yMinimum, layout.yMaximum, layout.plot.y, layout.plot.height, true)}
      {#if yAxis?.majorGridlines}<line class="gridline" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={y} y2={y} />{/if}
      <text class="tick" x={layout.plot.x - 6} y={y + 4} text-anchor="end">{tickLabel(tick, yFormat)}</text>
    {/each}
    {#each layout.xTicks as tick (tick)}
      {@const x = chartValueCoordinate(tick, layout.xMinimum, layout.xMaximum, layout.plot.x, layout.plot.width)}
      {#if xAxis?.majorGridlines}<line class="gridline" x1={x} x2={x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />{/if}
      <text class="tick" x={x} y={layout.plot.y + layout.plot.height + 17} text-anchor="middle">{tickLabel(tick, xFormat)}</text>
    {/each}
    <line class="axis" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={layout.plot.y + layout.plot.height} y2={layout.plot.y + layout.plot.height} />
    <line class="axis" x1={layout.plot.x} x2={layout.plot.x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />
    <g clip-path={`url(#${clipId})`}>
      {#each model.series as series, seriesIndex (series.index)}
        {@const points = layout.series[seriesIndex] ?? []}
        {#if scatterLineVisible(model, series)}
          <path d={scatterLinePath(points, scatterSmooth(model, series))} fill="none" stroke={color(series, seriesIndex, true)} stroke-width="2" />
        {/if}
        {#if scatterMarkerVisible(model, series)}
          {#each points as point (point.index)}
            {@const markerSize = series.marker?.size ?? 5}
            {@const symbol = series.marker?.symbol ?? "auto"}
            {#if symbol === "square"}
              <rect x={point.plotX - markerSize / 2} y={point.plotY - markerSize / 2} width={markerSize} height={markerSize} fill={color(series, seriesIndex, true)} />
            {:else if symbol === "diamond"}
              <path d={`M ${point.plotX} ${point.plotY - markerSize / 1.5} L ${point.plotX + markerSize / 1.5} ${point.plotY} L ${point.plotX} ${point.plotY + markerSize / 1.5} L ${point.plotX - markerSize / 1.5} ${point.plotY} Z`} fill={color(series, seriesIndex, true)} />
            {:else if symbol === "triangle"}
              <path d={`M ${point.plotX} ${point.plotY - markerSize / 1.3} L ${point.plotX + markerSize / 1.2} ${point.plotY + markerSize / 1.5} L ${point.plotX - markerSize / 1.2} ${point.plotY + markerSize / 1.5} Z`} fill={color(series, seriesIndex, true)} />
            {:else if symbol === "plus" || symbol === "x" || symbol === "dash"}
              <path d={symbol === "plus" ? `M ${point.plotX - markerSize} ${point.plotY} L ${point.plotX + markerSize} ${point.plotY} M ${point.plotX} ${point.plotY - markerSize} L ${point.plotX} ${point.plotY + markerSize}` : symbol === "x" ? `M ${point.plotX - markerSize} ${point.plotY - markerSize} L ${point.plotX + markerSize} ${point.plotY + markerSize} M ${point.plotX + markerSize} ${point.plotY - markerSize} L ${point.plotX - markerSize} ${point.plotY + markerSize}` : `M ${point.plotX - markerSize} ${point.plotY} L ${point.plotX + markerSize} ${point.plotY}`} fill="none" stroke={color(series, seriesIndex, true)} stroke-width="2" />
            {:else}
              <circle cx={point.plotX} cy={point.plotY} r={symbol === "dot" ? Math.max(1, markerSize / 3) : markerSize / 2} fill={color(series, seriesIndex, true)} />
            {/if}
          {/each}
        {/if}
      {/each}
    </g>
    {#if xAxis?.title !== undefined}<text class="axis-title" x={layout.plot.x + layout.plot.width / 2} y={height - 4} text-anchor="middle">{xAxis.title}</text>{/if}
    {#if yAxis?.title !== undefined}<text class="axis-title" transform={`translate(12 ${layout.plot.y + layout.plot.height / 2}) rotate(-90)`} text-anchor="middle">{yAxis.title}</text>{/if}
    {#if model.legend !== undefined}
      {#each model.series as series, index (series.index)}
        <g transform={`translate(${legendX(model, index)} ${legendY(model, index)})`}><rect width="10" height="10" y="-8" fill={color(series, index)} /><text x="15">{series.title ?? `Series ${index + 1}`}</text></g>
      {/each}
    {/if}
  </svg>
{:else if model.kind === "bubble"}
  {@const layout = layoutBubbleChart(model, width, height)}
  {@const xAxis = scatterAxis(model, 0)}
  {@const yAxis = scatterAxis(model, 1)}
  {@const xFormat = xAxis?.numberFormatCode ?? model.series.find((series) => series.xValues?.formatCode !== undefined)?.xValues?.formatCode}
  {@const yFormat = yAxis?.numberFormatCode ?? model.series.find((series) => series.values?.formatCode !== undefined)?.values?.formatCode}
  <svg class="chart" role="img" aria-label={accessibleName} viewBox={`0 0 ${width} ${height}`}>
    <title>{accessibleName}</title>
    <rect width={width} height={height} fill="#fff" />
    <defs><clipPath id={clipId}><rect x={layout.plot.x} y={layout.plot.y} width={layout.plot.width} height={layout.plot.height} /></clipPath></defs>
    {#if model.title !== undefined}<text class="title" x={width / 2} y="22" text-anchor="middle">{model.title}</text>{/if}
    {#each layout.yTicks as tick (tick)}
      {@const y = chartValueCoordinate(tick, layout.yMinimum, layout.yMaximum, layout.plot.y, layout.plot.height, true)}
      {#if yAxis?.majorGridlines}<line class="gridline" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={y} y2={y} />{/if}
      <text class="tick" x={layout.plot.x - 6} y={y + 4} text-anchor="end">{tickLabel(tick, yFormat)}</text>
    {/each}
    {#each layout.xTicks as tick (tick)}
      {@const x = chartValueCoordinate(tick, layout.xMinimum, layout.xMaximum, layout.plot.x, layout.plot.width)}
      {#if xAxis?.majorGridlines}<line class="gridline" x1={x} x2={x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />{/if}
      <text class="tick" x={x} y={layout.plot.y + layout.plot.height + 17} text-anchor="middle">{tickLabel(tick, xFormat)}</text>
    {/each}
    <line class="axis" x1={layout.plot.x} x2={layout.plot.x + layout.plot.width} y1={layout.plot.y + layout.plot.height} y2={layout.plot.y + layout.plot.height} />
    <line class="axis" x1={layout.plot.x} x2={layout.plot.x} y1={layout.plot.y} y2={layout.plot.y + layout.plot.height} />
    <g clip-path={`url(#${clipId})`}>
      {#each model.series as series, seriesIndex (series.index)}
        {#each layout.series[seriesIndex] ?? [] as point (point.index)}
          {#if point.radius > 0}
            <circle
              class="bubble"
              cx={point.plotX}
              cy={point.plotY}
              r={point.radius}
              fill={color(series, seriesIndex)}
              stroke={color(series, seriesIndex, true)}
            />
          {/if}
        {/each}
      {/each}
    </g>
    {#if xAxis?.title !== undefined}<text class="axis-title" x={layout.plot.x + layout.plot.width / 2} y={height - 4} text-anchor="middle">{xAxis.title}</text>{/if}
    {#if yAxis?.title !== undefined}<text class="axis-title" transform={`translate(12 ${layout.plot.y + layout.plot.height / 2}) rotate(-90)`} text-anchor="middle">{yAxis.title}</text>{/if}
    {#if model.legend !== undefined}
      {#each model.series as series, index (series.index)}
        <g transform={`translate(${legendX(model, index)} ${legendY(model, index)})`}><circle cx="5" cy="-3" r="5" fill={color(series, index)} /><text x="15">{series.title ?? `Series ${index + 1}`}</text></g>
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
            {@const seriesWidth = band * 0.72 / (model.grouping === "stacked" || model.grouping === "percent-stacked" ? 1 : Math.max(1, model.series.length))}
            {@const baselineY = chartValueCoordinate(cartesianStack(model, seriesIndex, index)?.start ?? 0, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)}
            {@const y = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.y, layout.plot.height, true)}
            <rect x={layout.plot.x + index * band + band * 0.14 + (model.grouping === "stacked" || model.grouping === "percent-stacked" ? 0 : seriesIndex) * seriesWidth} y={Math.min(y, baselineY)} width={Math.max(1, seriesWidth - 1)} height={Math.max(0.5, Math.abs(baselineY - y))} fill={color(series, seriesIndex)} />
          {/if}
        {/each}
      {/each}
    {:else if model.kind === "bar"}
      {#each model.series as series, seriesIndex (series.index)}
        {#each layout.categories as _category, index (index)}
          {@const current = value(model, series, index)}
          {#if current !== undefined}
            {@const band = layout.plot.height / count}
            {@const seriesHeight = band * 0.72 / (model.grouping === "stacked" || model.grouping === "percent-stacked" ? 1 : Math.max(1, model.series.length))}
            {@const baselineX = chartValueCoordinate(cartesianStack(model, seriesIndex, index)?.start ?? 0, layout.minimum, layout.maximum, layout.plot.x, layout.plot.width)}
            {@const x = chartValueCoordinate(current, layout.minimum, layout.maximum, layout.plot.x, layout.plot.width)}
            <rect x={Math.min(x, baselineX)} y={layout.plot.y + index * band + band * 0.14 + (model.grouping === "stacked" || model.grouping === "percent-stacked" ? 0 : seriesIndex) * seriesHeight} width={Math.max(0.5, Math.abs(baselineX - x))} height={Math.max(1, seriesHeight - 1)} fill={color(series, seriesIndex)} />
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
  .axis-title { fill: #333; font-size: 11px; font-weight: 600; }
  .bubble { fill-opacity: 0.72; }
  .chart-fallback { display: grid; place-items: center; padding: 12px; color: #666; background: repeating-linear-gradient(135deg, #fff, #fff 8px, #f7f7f7 8px, #f7f7f7 16px); text-align: center; }
</style>
