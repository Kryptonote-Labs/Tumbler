<script lang="ts">
  import { drawingPatternGeometry, type SlideObject } from '@tumblerjs/slides';
  let { pattern, id }: { pattern: NonNullable<SlideObject['pattern']>; id: string } = $props();
  const geometry = $derived(drawingPatternGeometry(pattern.preset));
</script>

<pattern {id} patternUnits="userSpaceOnUse" width={geometry.size} height={geometry.size}>
  <rect width="100%" height="100%" fill={pattern.background} />
  {#each geometry.rects as rect}<rect {...rect} fill={pattern.foreground} />{/each}
  {#if geometry.path}<path
      d={geometry.path}
      fill={geometry.filled ? pattern.foreground : 'none'}
      stroke={geometry.filled ? 'none' : pattern.foreground}
      stroke-width={geometry.strokeWidth}
    />{/if}
</pattern>
