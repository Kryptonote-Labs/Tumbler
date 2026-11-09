<script lang="ts">
  import { linearGradientLine, rectangularGradientFaces } from '@tumblerjs/ooxml';
  import type { DrawingGradient } from '@tumblerjs/ooxml';
  let {
    gradient,
    id,
    width,
    height,
  }: { gradient: DrawingGradient; id: string; width: number; height: number } = $props();
  let line = $derived(linearGradientLine(gradient, width, height));
  let faces = $derived(rectangularGradientFaces(gradient.center));
</script>

{#snippet stops()}
  {#each gradient.stops as stop}<stop offset={stop.offset} stop-color={stop.color} />{/each}
{/snippet}
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
    {@render stops()}
  </linearGradient>
{:else if gradient.kind === 'rectangular'}
  <!-- SVG has no rectangular paint server; a bounding-box pattern of shaded faces stands in.
       Crisp edges tile the faces without seams; colour is continuous across them. -->
  <pattern {id} width="1" height="1" patternContentUnits="objectBoundingBox">
    {#each faces as face, i}
      <linearGradient
        id={`${id}-${i}`}
        gradientUnits="userSpaceOnUse"
        x1={face.line[0]}
        y1={face.line[1]}
        x2={face.line[2]}
        y2={face.line[3]}
        color-interpolation="sRGB">{@render stops()}</linearGradient
      >
      <polygon
        points={face.points.join(' ')}
        fill={`url(#${id}-${i})`}
        shape-rendering="crispEdges"
      />
    {/each}
  </pattern>
{:else}
  <radialGradient
    {id}
    cx={gradient.center[0]}
    cy={gradient.center[1]}
    r="0.5"
    color-interpolation="sRGB"
  >
    {@render stops()}
  </radialGradient>
{/if}
