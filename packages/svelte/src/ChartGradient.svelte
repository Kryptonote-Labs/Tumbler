<script lang="ts">
  import { linearGradientLine, rectangularGradientFaces } from '@tumblerjs/ooxml';
  import type { ChartGradientPaint } from '@tumblerjs/charts';
  let { paint, id }: { paint: ChartGradientPaint; id: string } = $props();
  let bounds = $derived(paint.bounds), gradient = $derived(paint.gradient);
  let line = $derived(linearGradientLine(gradient, bounds.width, bounds.height));
</script>

{#snippet stops()}
  {#each gradient.stops as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}
{/snippet}
{#if gradient.kind === 'linear'}
  <linearGradient {id} gradientUnits="userSpaceOnUse" x1={bounds.x + line[0]} y1={bounds.y + line[1]} x2={bounds.x + line[2]} y2={bounds.y + line[3]} color-interpolation="sRGB">{@render stops()}</linearGradient>
{:else if gradient.kind === 'radial'}
  <radialGradient {id} gradientUnits="userSpaceOnUse" cx={gradient.center[0]} cy={gradient.center[1]} r="0.5" gradientTransform={`translate(${bounds.x} ${bounds.y}) scale(${bounds.width} ${bounds.height})`} color-interpolation="sRGB">{@render stops()}</radialGradient>
{:else}
  {@const focus = gradient.focusRect}
  <pattern {id} patternUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
    {#if focus}<rect x={focus[0] * bounds.width} y={focus[1] * bounds.height} width={Math.max(0, focus[2] - focus[0]) * bounds.width} height={Math.max(0, focus[3] - focus[1]) * bounds.height} fill={gradient.stops[0]?.color} />{/if}
    {#each rectangularGradientFaces(gradient.center, 0, gradient.focusRect) as face, i}
      <linearGradient id={`${id}-${i}`} gradientUnits="userSpaceOnUse" x1={face.line[0] * bounds.width} y1={face.line[1] * bounds.height} x2={face.line[2] * bounds.width} y2={face.line[3] * bounds.height} color-interpolation="sRGB">{@render stops()}</linearGradient>
      <polygon points={face.points.map(([x, y]) => `${x * bounds.width},${y * bounds.height}`).join(' ')} fill={`url(#${id}-${i})`} shape-rendering="crispEdges" />
    {/each}
  </pattern>
{/if}
