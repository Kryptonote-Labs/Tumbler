<script lang="ts">
  import { drawingGradientCircle, drawingGradientFocus, drawingGradientStops, linearGradientLine, rectangularGradientFaces } from '@tumblerjs/ooxml';
  import type { ChartGradientPaint } from '@tumblerjs/charts';
  let { paint, id, palette }: { paint: ChartGradientPaint; id: string; palette?: string | undefined } = $props();
  let bounds = $derived(paint.bounds), gradient = $derived(paint.gradient);
  let line = $derived(linearGradientLine(gradient, bounds.width, bounds.height));
  const focus = $derived(drawingGradientFocus(gradient)), circle = $derived(drawingGradientCircle(gradient, bounds.width, bounds.height));
</script>

{#snippet stops()}
  {#each drawingGradientStops(gradient) as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}
{/snippet}
{#if gradient.kind === 'linear'}
  <linearGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" x1={bounds.x + line[0]} y1={bounds.y + line[1]} x2={bounds.x + line[2]} y2={bounds.y + line[3]} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</linearGradient>
{:else if circle}
  <radialGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" cx={bounds.x + circle.x} cy={bounds.y + circle.y} r={circle.radius} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</radialGradient>
{:else if gradient.kind === 'radial'}
  <radialGradient {id} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" cx={gradient.center[0]} cy={gradient.center[1]} r="0.5" gradientTransform={`translate(${bounds.x} ${bounds.y}) scale(${bounds.width} ${bounds.height})`} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</radialGradient>
{:else}
  {@const rect = focus.focusRect}
  <pattern {id} patternUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
    {#if rect}<rect x={rect[0] * bounds.width} y={rect[1] * bounds.height} width={Math.max(0, rect[2] - rect[0]) * bounds.width} height={Math.max(0, rect[3] - rect[1]) * bounds.height} fill={gradient.stops[0]?.color} />{/if}
    {#each rectangularGradientFaces(focus.center, 0, focus.focusRect) as face, i}
      <linearGradient id={`${id}-${i}`} href={palette && `#${palette}`} gradientUnits="userSpaceOnUse" x1={face.line[0] * bounds.width} y1={face.line[1] * bounds.height} x2={face.line[2] * bounds.width} y2={face.line[3] * bounds.height} color-interpolation="sRGB">{#if !palette}{@render stops()}{/if}</linearGradient>
      <polygon points={face.points.map(([x, y]) => `${x * bounds.width},${y * bounds.height}`).join(' ')} fill={`url(#${id}-${i})`} shape-rendering="crispEdges" />
    {/each}
  </pattern>
{/if}
