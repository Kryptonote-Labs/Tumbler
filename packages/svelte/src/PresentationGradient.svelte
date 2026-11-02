<script lang="ts">
  import { linearGradientLine } from '@tumblerjs/slides';
  import type { DrawingGradient } from '@tumblerjs/slides';
  let {
    gradient,
    id,
    width,
    height,
  }: { gradient: DrawingGradient; id: string; width: number; height: number } = $props();
  let line = $derived(linearGradientLine(gradient, width, height));
</script>

{#if gradient.kind === 'linear'}
  <linearGradient
    {id}
    gradientUnits="userSpaceOnUse"
    x1={line[0]}
    y1={line[1]}
    x2={line[2]}
    y2={line[3]}
    color-interpolation="sRGB"
  >
    {#each gradient.stops as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}
  </linearGradient>
{:else}
  <radialGradient
    {id}
    cx={gradient.center[0]}
    cy={gradient.center[1]}
    r="0.5"
    color-interpolation="sRGB"
    >{#each gradient.stops as stop}<stop
        offset={stop.offset}
        stop-color={stop.color}
      />{/each}</radialGradient
  >
{/if}
