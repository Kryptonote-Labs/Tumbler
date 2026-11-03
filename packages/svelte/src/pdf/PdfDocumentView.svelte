<script lang="ts">
  import { onMount } from 'svelte';
  import { trackPdfSelection } from './pointer-selection.ts';
  import { selectedPdfText } from './selection.ts';
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
  onMount(() => {
    const stopSelection = trackPdfSelection(host);
    const copy = (event: ClipboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]')) return;
      if (!host.getClientRects().length || host.closest('[inert],[hidden]')) return;
      const text = selectedPdfText(window.getSelection(), host);
      if (text === undefined || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    };
    host.ownerDocument.addEventListener('copy', copy);
    return () => { stopSelection(); host.ownerDocument.removeEventListener('copy', copy); };
  });
  export function goToPage(index: number) {
    host.querySelector(`[data-pdf-page="${index + 1}"]`)?.scrollIntoView({ block: 'start' });
  }
</script>

<div class="pdf-document" bind:this={host}>
  {#key document}
  {#each document.pages as page, index (page.id)}
    <PdfPageView {interpreter} {index} {scale} onvisible={onpagechange} {onerror} />
  {/each}
  {/key}
</div>

<style>
  .pdf-document { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; min-width: min-content; }
</style>
