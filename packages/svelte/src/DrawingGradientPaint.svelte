<script lang="ts">
  import { drawingGradientCircle, drawingGradientTileFocus, drawingGradientTile, drawingGradientStops, linearGradientLine, rectangularGradientFaces } from '@tumblerjs/ooxml';
  import type { DrawingGradient, DrawingGradientRect } from '@tumblerjs/ooxml';
  let { gradient, bounds, id, palette }: { gradient: DrawingGradient; bounds: DrawingGradientRect; id: string; palette?: string | undefined } = $props();
  const tile = $derived(drawingGradientTile(gradient));
  const width = $derived(bounds.width * (tile?.width ?? 1)), height = $derived(bounds.height * (tile?.height ?? 1));
  const x = $derived(bounds.x + (tile?.x ?? 0) * bounds.width), y = $derived(bounds.y + (tile?.y ?? 0) * bounds.height);
  let line = $derived(linearGradientLine(gradient, width, height));
  const focus = $derived(drawingGradientTileFocus(gradient)), circle = $derived(drawingGradientCircle(gradient, bounds.width, bounds.height));
</script>

{#snippet stops()}
  {#each drawingGradientStops(gradient) as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}
{/snippet}
{#if gradient.kind === 'linear'}
  <linearGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" x1={x + line[0]} y1={y + line[1]} x2={x + line[2]} y2={y + line[3]} spreadMethod={tile ? "reflect" : "pad"} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</linearGradient>
{:else if circle}
  <radialGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" cx={bounds.x + circle.x} cy={bounds.y + circle.y} r={circle.radius} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</radialGradient>
{:else if gradient.kind === 'radial'}
  <radialGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" cx={gradient.center[0]} cy={gradient.center[1]} r="0.5" gradientTransform={`translate(${bounds.x} ${bounds.y}) scale(${bounds.width} ${bounds.height})`} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</radialGradient>
{:else}
  {@const rect = focus.focusRect}
  <pattern {id} patternUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
    <g id={`${id}-tile`}>
    {#if rect}<rect x={rect[0] * width} y={rect[1] * height} width={Math.max(0, rect[2] - rect[0]) * width} height={Math.max(0, rect[3] - rect[1]) * height} fill={gradient.stops[0]?.color} />{/if}
    {#each rectangularGradientFaces(focus.center, 0, focus.focusRect) as face, i}
      <linearGradient id={`${id}-${i}`} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" x1={face.line[0] * width} y1={face.line[1] * height} x2={face.line[2] * width} y2={face.line[3] * height} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</linearGradient>
      <polygon points={face.points.map(([x, y]) => `${x * width},${y * height}`).join(' ')} fill={`url(#${id}-${i})`} shape-rendering="crispEdges" />
    {/each}
    </g>

  </pattern>
{/if}
