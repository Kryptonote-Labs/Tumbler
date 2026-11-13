<script lang="ts">
  import { untrack } from 'svelte';
  import { openWordArtifact } from '@tumblerjs/word';
  import { WordDocumentView } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openWordArtifact(bytes));
  let width = $state(0);
  let scale = $state(0.5);

  // Fit a Letter page (816px) inside the view's 24px margins.
  $effect(() => {
    if (width) scale = Math.min(1, (width - 48) / 816);
  });
</script>

<div class="document" bind:clientWidth={width}>
  <WordDocumentView
    wordDocument={artifact.document}
    bind:scale
  />
</div>

<style>
  .document { height: 420px; min-width: 0; }
</style>
