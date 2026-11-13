<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationArtifact } from '@tumblerjs/slides';
  import {
    PresentationSlideView,
  } from '@tumblerjs/svelte/slides';

  let { bytes }: { bytes: Uint8Array } = $props();
  const { document } = untrack(
    () => openPresentationArtifact(bytes),
  );
  let index = $state(0);
  let scale = $state(1);
  const slide = $derived(document.slides[index]);
</script>

<label>
  Slide
  <select aria-label="Slide" bind:value={index}>
    {#each document.slides as { title }, i}
      <option value={i}>{i + 1}. {title}</option>
    {/each}
  </select>
</label>
<div class="slide-example">
  {#if slide}
    <PresentationSlideView
      presentation={document}
      {slide}
      bind:scale
    />
  {/if}
</div>

<style>
  label {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;
  }
  select { min-width: 0; max-width: 85%; }
  .slide-example { height: 430px; min-width: 0; }
</style>
