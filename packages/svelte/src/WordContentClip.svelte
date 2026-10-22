<script lang="ts">
  import type { Snippet } from 'svelte';
  import { wordPointsToCssPixels as pixels, type WordContentBounds } from '@tumblerjs/word';
  let { clip, children }: { clip?: WordContentBounds; children: Snippet } = $props();
  const style = $derived(clip
    ? `position:absolute;inset:0;clip-path:polygon(${pixels(clip.x)}px ${pixels(clip.y)}px,${pixels(clip.x + clip.width)}px ${pixels(clip.y)}px,${pixels(clip.x + clip.width)}px ${pixels(clip.y + clip.height)}px,${pixels(clip.x)}px ${pixels(clip.y + clip.height)}px);pointer-events:none`
    : 'display:contents');
</script>

{#if clip}
  <div {style}>{@render children()}</div>
{:else}
  {@render children()}
{/if}

<style>
  div > :global(*) { pointer-events: auto; }
</style>
