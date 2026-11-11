<script lang="ts">
  import { drawingPatternPicture, type DrawingPattern } from '@tumblerjs/ooxml';
  let { pattern, id, light = 1, origin = { x: 0, y: 0 } }: { pattern: DrawingPattern; id: string; light?: number | undefined; origin?: { readonly x: number; readonly y: number } } = $props();
  const href = $derived(`data:image/png;base64,${btoa(String.fromCharCode(...drawingPatternPicture(pattern).bytes))}`);
</script>

<pattern {id} patternUnits="userSpaceOnUse" x={-origin.x} y={-origin.y} width="8" height="8">
  {#if light !== 1}<defs><filter id={`${id}-light`} x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope={light}/><feFuncG type="linear" slope={light}/><feFuncB type="linear" slope={light}/></feComponentTransfer></filter></defs>{/if}
  <image {href} width="8" height="8" filter={light !== 1 ? `url(#${id}-light)` : undefined} />
</pattern>
