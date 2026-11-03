<script lang="ts">
  import { PdfInterpreter, type PdfDocument } from '@tumblerjs/pdf';
  import PdfPageView from './PdfPageView.svelte';
  let { document, scale = 4 / 3, onpagechange, onerror }: {
    document: PdfDocument;
    scale?: number;
    onpagechange?: (page: number) => void;
    onerror?: (error: Error, page: number) => void;
  } = $props();
  const interpreter = $derived(new PdfInterpreter(document));
  let host: HTMLDivElement;
  export function goToPage(index: number) {
    host.querySelector(`[data-pdf-page="${index + 1}"]`)?.scrollIntoView({ block: 'start' });
  }
</script>

<div class="pdf-document" bind:this={host}>
  {#each document.pages as page, index (page.id)}
    <PdfPageView {interpreter} {index} {scale} onvisible={onpagechange} {onerror} />
  {/each}
</div>

<style>
  .pdf-document { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; min-width: min-content; }
</style>
