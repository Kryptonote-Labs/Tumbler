<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { WordContentBounds } from '@tumblerjs/word';
  import { wordContentClipCss } from './word-content-clip.ts';
  let { clip, layer, children }: { clip?: WordContentBounds; layer?: number; children: Snippet } = $props();
  const style = $derived(`position:absolute;inset:0;${wordContentClipCss(clip)};pointer-events:none;${layer === undefined ? '' : `z-index:${layer}`}`);

</script>

{#if clip}
  <div {style}>{@render children()}</div>
{:else}
  {@render children()}
{/if}

<style>
  div > :global(*) { pointer-events: auto; }
</style>
