<script lang="ts">
  import type { PdfSearchController } from './search.svelte.ts';
  import PdfSearch from './PdfSearch.svelte';
  import { PdfSearchIndex } from '@tumblerjs/pdf';
  import { onMount } from 'svelte';
  import { trackPdfSelection } from './pointer-selection.ts';
  import { selectedPdfText } from './selection.ts';
  import { PdfInterpreter, type PdfDocument } from '@tumblerjs/pdf';
  import { PdfPageRenderer } from './page-renderer.ts';
  import PdfPageView from './PdfPageView.svelte';
  let {
    document,
    scale = 4 / 3,
    search,
    searchEnabled = true,
    onpagechange,
    onerror,
  }: {
    document: PdfDocument;
    scale?: number;
    search?: PdfSearchController;
    searchEnabled?: boolean;
    onpagechange?: (page: number) => void;
    onerror?: (error: Error, page: number) => void;
  } = $props();
  let renderer = $state.raw<PdfPageRenderer>();
  $effect(() => {
    const current = new PdfPageRenderer(document);
    renderer = current;
    return () => current.destroy();
  });
  const interpreter = $derived(new PdfInterpreter(document));
  let host = $state<HTMLDivElement>();
  onMount(() => {
    const element = host;
    if (!element) return;
    const stopSelection = trackPdfSelection(element);
    const copy = (event: ClipboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,[contenteditable]')
      )
        return;
      if (!element.getClientRects().length || element.closest('[inert],[hidden]')) return;
      const text = selectedPdfText(window.getSelection(), element);
      if (text === undefined || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    };
    element.ownerDocument.addEventListener('copy', copy);
    return () => {
      stopSelection();
      element.ownerDocument.removeEventListener('copy', copy);
    };
  });
  export function goToPage(index: number) {
    host?.querySelector(`[data-pdf-page="${index + 1}"]`)?.scrollIntoView({ block: 'start' });
  }
  const searchIndex = $derived(new PdfSearchIndex(document, undefined, interpreter));
</script>

<div
  class="pdf-document"
  data-pdf-document
  data-pdf-max-width={document.pages.reduce((maximum, page) => Math.max(maximum, page.width), 0)}
  bind:this={host}
>
  {#if renderer}
    {#key document}
      {#each document.pages as page, index (page.id)}
        <PdfPageView {interpreter} {renderer} {index} {scale} onvisible={onpagechange} {onerror} />
      {/each}
    {/key}
  {/if}
</div>

<PdfSearch root={host} {scale} index={() => searchIndex} controller={search} enabled={searchEnabled} />

<style>
  .pdf-document {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 24px;
    min-width: min-content;
  }
</style>
