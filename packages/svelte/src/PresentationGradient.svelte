<script lang="ts">
  import type { DrawingGradient } from "@tumblerjs/slides";
  let {
    gradient,
    id,
    width,
    height,
  }: { gradient: DrawingGradient; id: string; width: number; height: number } =
    $props();
  let angle = $derived((gradient.angle * Math.PI) / 180);
  let gx = $derived(Math.cos(angle) * (gradient.scaled ? width : 1)),
    gy = $derived(Math.sin(angle) * (gradient.scaled ? height : 1));
  let length = $derived(
    (Math.abs(width * gx) + Math.abs(height * gy)) / (gx * gx + gy * gy || 1),
  );
</script>

{#if gradient.kind === "linear"}
  <linearGradient
    {id}
    gradientUnits="userSpaceOnUse"
    x1={width / 2 - (gx * length) / 2}
    y1={height / 2 - (gy * length) / 2}
    x2={width / 2 + (gx * length) / 2}
    y2={height / 2 + (gy * length) / 2}
    color-interpolation="sRGB"
  >
    {#each gradient.stops as stop}<stop
        offset={stop.offset}
        stop-color={stop.color}
      />{/each}
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
