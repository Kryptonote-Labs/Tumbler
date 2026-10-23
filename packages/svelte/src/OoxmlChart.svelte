<script lang="ts">
  import { layoutChartScene, type ChartColor, type ChartMark, type ChartModel } from "@tumblerjs/charts";
  import { measureChartText } from "./chart-text.ts";

  interface Props {
    readonly model: ChartModel;
    readonly width: number;
    readonly height: number;
    readonly resolveColor?: (color: ChartColor) => string | undefined;
    readonly formatNumber?: (value: number, formatCode: string | undefined) => string;
    /** Prefix for clip-path ids; unique per chart on the page. */
    readonly clipId?: string;
  }

  let { model, width, height, resolveColor, formatNumber, clipId = "tumbler-chart-clip" }: Props = $props();
  // Legends are laid out with measured text, so they re-measure once web fonts arrive.
  let fonts = $state(0);
  $effect(() => {
    const loaded = () => { fonts += 1; };
    document.fonts.addEventListener("loadingdone", loaded);
    return () => document.fonts.removeEventListener("loadingdone", loaded);
  });
  let scene = $derived.by(() => {
    void fonts;
    try {
      return model.status === "supported" ? layoutChartScene(model, width, height, { resolveColor, formatNumber, measureText: measureChartText }) : undefined;
    } catch {
      // A bad scale, host callback or preview budget must not break the host document.
      return undefined;
    }
  });
</script>

{#snippet marks(list: readonly ChartMark[], path: string)}
  {#each list as mark, index}
    {#if mark.kind === "rect"}
      <rect x={mark.x} y={mark.y} width={mark.width} height={mark.height} fill={mark.fill} stroke={mark.stroke} />
    {:else if mark.kind === "circle"}
      <circle cx={mark.cx} cy={mark.cy} r={mark.r} fill={mark.fill} stroke={mark.stroke} fill-opacity={mark.fillOpacity} />
    {:else if mark.kind === "path"}
      <path d={mark.d} fill={mark.fill ?? "none"} stroke={mark.stroke} stroke-width={mark.strokeWidth} />
    {:else if mark.kind === "line"}
      <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke={mark.stroke} stroke-width={mark.width} shape-rendering="crispEdges" />
    {:else if mark.kind === "text"}
      <text style="white-space:pre" x={mark.x} y={mark.y} text-anchor={mark.anchor} transform={mark.rotate ? `rotate(${mark.rotate} ${mark.x} ${mark.y})` : undefined} font-family={mark.font.family} font-size={mark.font.size} font-weight={mark.font.weight} font-style={mark.font.italic ? "italic" : undefined} fill={mark.font.color}>{mark.text}</text>
    {:else if mark.clip}
      {@const id = `${clipId}${path}-${index}`}
      <defs><clipPath {id}><rect x={mark.clip.x} y={mark.clip.y} width={mark.clip.width} height={mark.clip.height} /></clipPath></defs>
      <g class={mark.role && `chart-${mark.role}`} clip-path={`url(#${id})`}>{@render marks(mark.marks, `${path}-${index}`)}</g>
    {:else}
      <g class={mark.role && `chart-${mark.role}`}>{@render marks(mark.marks, `${path}-${index}`)}</g>
    {/if}
  {/each}
{/snippet}

{#if scene}
  <svg class="chart" role="img" aria-label={scene.label} viewBox={`0 0 ${width} ${height}`}>
    <title>{scene.label}</title>
    {@render marks(scene.marks, "")}
  </svg>
{:else}
  <div class="chart-fallback" role="img" aria-label={model.title ?? "Chart preview unavailable"} title={model.status === "unsupported" ? model.reason : undefined}>
    <span>Chart preview unavailable</span>
  </div>
{/if}

<style>
  .chart, .chart-fallback { display: block; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; background: #fff; }
  .chart { pointer-events: none; }
  .chart-fallback { display: grid; place-items: center; padding: 12px; border: 1px solid #d9d9d9; color: #666; font: 11px/1.2 Calibri, Aptos, system-ui, sans-serif; background: repeating-linear-gradient(135deg, #fff, #fff 8px, #f7f7f7 8px, #f7f7f7 16px); text-align: center; }
</style>
