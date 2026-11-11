<script lang="ts">
  import type { ChartGradientPaint } from '@tumblerjs/charts';
  import DrawingGradientPaint from './DrawingGradientPaint.svelte';
  let { paint, id, palette }: { paint: ChartGradientPaint; id: string; palette?: string | undefined } = $props();
</script>
<DrawingGradientPaint gradient={paint.gradient} bounds={paint.bounds} {id} {palette} />
