<script lang="ts">
  import type { DrawingGradient } from '@tumblerjs/ooxml';
  import DrawingGradientPaint from './DrawingGradientPaint.svelte';
  let { gradient, id, width, height }: { gradient: DrawingGradient; id: string; width: number; height: number } = $props();
</script>
<DrawingGradientPaint {gradient} bounds={{ x: 0, y: 0, width, height }} {id} />
