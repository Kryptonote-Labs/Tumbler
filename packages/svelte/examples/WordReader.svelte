<script lang="ts">
  import { WordDocumentView, type EmbeddedFontContext, type WordDocument, type WordViewHandle, type WordViewLayout, type WordViewViewport } from "../src/word.ts";

  let { wordDocument, fontContext }: { wordDocument: WordDocument; fontContext?: EmbeddedFontContext } = $props();
  let viewer = $state<WordViewHandle>();
  let geometry = $state<WordViewLayout>();
  let viewport = $state<WordViewViewport>();
  let fitOnLoad = $state(true);

  function layoutChanged(next: WordViewLayout) {
    geometry = next;
    if (fitOnLoad) {
      fitOnLoad = false;
      viewer?.fit("page");
    }
  }

  // Hide the old document's status until the replacement layout arrives.
  const pageCount = $derived(geometry?.document === wordDocument ? geometry.pages.length : 0);
  const pageIndex = $derived(viewport?.document === wordDocument ? viewport.currentPage : undefined);
</script>

<div class="reader">
  <nav aria-label="Document navigation">
    <button onclick={() => viewer?.fit("width")}>Fit width</button>
    <button onclick={() => viewer?.fit("page")}>Fit page</button>
    <button disabled={pageIndex === undefined || pageIndex === 0}
      onclick={() => viewer?.scrollToPage((pageIndex ?? 0) - 1)}>Previous</button>
    <button disabled={pageIndex === undefined || pageIndex + 1 >= pageCount}
      onclick={() => viewer?.scrollToPage((pageIndex ?? 0) + 1)}>Next</button>
    <output aria-live="polite">Page {pageIndex === undefined ? "–" : pageIndex + 1} of {pageCount}{geometry?.document === wordDocument && !geometry.complete ? "+" : ""}</output>
  </nav>
  <main>
    <WordDocumentView bind:this={viewer} {...{ wordDocument, fontContext }}
      onlayoutchange={layoutChanged} onviewportchange={(next) => viewport = next} />
  </main>
</div>

<style>
  .reader { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
  nav { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; }
  main { min-width: 0; min-height: 0; }
</style>
