<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { WordContentBounds } from '@tumblerjs/word';
  import { wordContentClipCss } from './word-content-clip.ts';
  // Decoration-only wrappers must not become native caret destinations.
  let { clip, layer, children, decorative = false }: { clip?: WordContentBounds; layer?: number; children: Snippet; decorative?: boolean } = $props();
  const style = $derived(`position:absolute;inset:0;${wordContentClipCss(clip)};pointer-events:none;${layer === undefined ? '' : `z-index:${layer}`}`);

</script>

{#if clip}
  <div {style} contenteditable={decorative ? false : undefined}>{@render children()}</div>
{:else}
  {@render children()}
{/if}

<style>
  div > :global(*) { pointer-events: auto; }
</style>
