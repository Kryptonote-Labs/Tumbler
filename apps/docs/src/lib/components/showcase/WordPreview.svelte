<script lang="ts">
  import { untrack } from 'svelte';
  import { openWordArtifact } from '@tumblerjs/word';
  import { WordDocumentView } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openWordArtifact(bytes));
  let scale = $state(0.75);
</script>

<label>Zoom
  <select bind:value={scale}>
    <option value={0.5}>50%</option>
    <option value={0.75}>75%</option>
    <option value={1}>100%</option>
    <option value={1.5}>150%</option>
    {#if ![0.5, 0.75, 1, 1.5].includes(scale)}<option value={scale}>{Math.round(scale * 100)}%</option>{/if}
  </select>
</label>
<div class="document"><WordDocumentView wordDocument={artifact.document} bind:scale /></div>

<style>
  label { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .document { height: 420px; min-width: 0; }
</style>
