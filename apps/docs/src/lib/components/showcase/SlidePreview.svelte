<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';
  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openPresentationArtifact(bytes));
  let index = $state(0);
  let scale = $state(1);
</script>
<label>Slide <select aria-label="Slide" bind:value={index}>{#each artifact.document.slides as slide, i}<option value={i}>{i+1}. {slide.title}</option>{/each}</select></label>
<div class="slide-example">
  {#if artifact.document.slides[index]}<PresentationSlideView presentation={artifact.document} slide={artifact.document.slides[index]!} bind:scale />{/if}
</div>
<style>
  label { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
  select { min-width: 0; max-width: 85%; }
  .slide-example { height: 430px; min-width: 0; }
</style>
