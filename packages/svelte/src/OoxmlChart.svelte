<script lang="ts">
  import { layoutChartScene, type ChartColor, type ChartMark, type ChartModel } from "@tumblerjs/charts";
  import { chartGradientPalettes } from './chart-gradient-palettes.ts';
  import PresentationPattern from './PresentationPattern.svelte';
  import ChartGradient from "./ChartGradient.svelte";
  import PresentationPictureFill from './PresentationPictureFill.svelte';
  import { measureChartText } from "./chart-text.ts";

  interface Props {
    readonly model: ChartModel;
    readonly width: number;
    readonly height: number;
    readonly resolveColor?: (color: ChartColor) => string | undefined;
    readonly formatNumber?: (value: number, formatCode: string | undefined) => string;
    /** Prefix for clip-path ids; unique per chart on the page. */
    readonly clipId?: string;
    readonly patternOrigin?: { readonly x: number; readonly y: number };
  }

  const generatedClipId = $props.id();
  let { model, width, height, resolveColor, formatNumber, patternOrigin, clipId = generatedClipId }: Props = $props();
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
      return model.status === "supported" ? layoutChartScene(model, width, height, { resolveColor, formatNumber, patternOrigin, measureText: measureChartText }) : undefined;
    } catch {
      // A bad scale, host callback or preview budget must not break the host document.
      return undefined;
    }
  });
  const ramps = $derived(chartGradientPalettes(scene?.marks ?? [], clipId));

  // A paint-kind change replaces the each scope, keeping old child getters valid until teardown.
  function markKey(mark: ChartMark, index: number) {
    const fill = mark.fillPattern ? 'pattern' : mark.fillPicture ? 'picture' : mark.fillGradient ? 'gradient' : 'solid';
    return `${index}:${mark.kind}:${fill}:${!!(mark.strokeGradient && mark.strokeBounds)}:${mark.kind === 'group' && !!mark.clip}`;
  }
</script>

{#snippet marks(list: readonly ChartMark[], path: string)}
  {#each list as mark, index (markKey(mark, index))}
    {@const paintId = `${clipId}${path}-${index}-fill`}
    {#if mark.fillPattern}<defs><PresentationPattern pattern={mark.fillPattern.pattern} light={mark.fillPattern.light} origin={mark.fillPattern.origin} id={paintId} /></defs>
    {:else if mark.fillPicture}<defs><PresentationPictureFill picture={mark.fillPicture.picture} origin={mark.fillPicture.bounds} width={mark.fillPicture.bounds.width} height={mark.fillPicture.bounds.height} id={paintId} /></defs>
    {:else if mark.fillGradient}<defs><ChartGradient paint={mark.fillGradient} palette={ramps.bindings.get(mark.fillGradient.gradient)} id={paintId} /></defs>{/if}
    {@const strokeId = `${clipId}${path}-${index}-stroke`}
    {#if mark.strokeGradient && mark.strokeBounds}<defs><ChartGradient paint={{ gradient: mark.strokeGradient, bounds: mark.strokeBounds }} palette={ramps.bindings.get(mark.strokeGradient)} id={strokeId} /></defs>{/if}
    {#if mark.kind === "rect"}
      <rect x={mark.x} y={mark.y} width={mark.width} height={mark.height} fill={mark.fillPattern || mark.fillPicture || mark.fillGradient ? `url(#${paintId})` : mark.fill} stroke={mark.strokeGradient && mark.strokeBounds ? `url(#${strokeId})` : mark.stroke} stroke-width={mark.strokeWidth} stroke-dasharray={mark.strokeDash?.join(" ")} stroke-linecap={mark.strokeCap} stroke-linejoin={mark.strokeJoin} stroke-miterlimit={mark.miterLimit?.toString()} />
    {:else if mark.kind === "circle"}
      <circle cx={mark.cx} cy={mark.cy} r={mark.r} fill={mark.fillPattern || mark.fillPicture || mark.fillGradient ? `url(#${paintId})` : mark.fill} stroke={mark.strokeGradient && mark.strokeBounds ? `url(#${strokeId})` : mark.stroke} stroke-width={mark.strokeWidth} stroke-dasharray={mark.strokeDash?.join(" ")} stroke-linecap={mark.strokeCap} stroke-linejoin={mark.strokeJoin} stroke-miterlimit={mark.miterLimit?.toString()} fill-opacity={mark.fillOpacity} />
    {:else if mark.kind === "path"}
      <path d={mark.d} fill={mark.fillPattern || mark.fillPicture || mark.fillGradient ? `url(#${paintId})` : mark.fill ?? "none"} stroke={mark.strokeGradient && mark.strokeBounds ? `url(#${strokeId})` : mark.stroke} stroke-width={mark.strokeWidth} stroke-dasharray={mark.strokeDash?.join(" ")} stroke-linecap={mark.strokeCap} stroke-linejoin={mark.strokeJoin} stroke-miterlimit={mark.miterLimit?.toString()} />
    {:else if mark.kind === "line"}
      <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke={mark.strokeGradient && mark.strokeBounds ? `url(#${strokeId})` : mark.stroke} stroke-width={mark.width} stroke-dasharray={mark.strokeDash?.join(" ")} stroke-linecap={mark.strokeCap} stroke-linejoin={mark.strokeJoin} stroke-miterlimit={mark.miterLimit?.toString()} shape-rendering="crispEdges" />
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
    <defs>{#each ramps.palettes as palette}<linearGradient id={palette.id}>{#each palette.stops as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}</linearGradient>{/each}</defs>
    {@render marks(scene.marks, "")}
  </svg>
{:else}
  <div class="chart-fallback" role="img" aria-label={model.title ?? "Chart preview unavailable"} title={model.status === "unsupported" ? model.reason : undefined}>
    <span>Chart preview unavailable</span>
  </div>
{/if}

<style>
  .chart, .chart-fallback { display: block; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; }
  .chart { pointer-events: none; }
  .chart-fallback { display: grid; place-items: center; padding: 12px; border: 1px solid #d9d9d9; color: #666; font: 11px/1.2 Calibri, Aptos, system-ui, sans-serif; background: repeating-linear-gradient(135deg, #fff, #fff 8px, #f7f7f7 8px, #f7f7f7 16px); text-align: center; }
</style>
